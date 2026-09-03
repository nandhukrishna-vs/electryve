import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Cart from "../models/Cart.js";
import Address from "../models/Address.js";
import User from "../models/User.js";
import Coupon from "../models/Coupon.js";
import { getCart } from "./cartService.js";
import { validateUserCoupon } from "./couponService.js";

const generateOrderNumber = async (opts = {}) => {
  const now = new Date();
  const dateStr = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');

  let orderNumber;
  let isUnique = false;

  while (!isUnique) {
    const randomStr = String(Math.floor(1000 + Math.random() * 9000));
    orderNumber = `ELV-${dateStr}-${randomStr}`;
    const existing = await Order.findOne({ orderNumber }).session(opts.session || null);
    if (!existing) {
      isUnique = true;
    }
  }

  return orderNumber;
};

/**
 * Detects whether the current MongoDB deployment supports replica set / sharded transactions.
 */
const checkTransactionSupport = () => {
  try {
    const topologyType = mongoose.connection?.client?.topology?.description?.type;
    if (topologyType) {
      return ["ReplicaSetWithPrimary", "ReplicaSetNoPrimary", "Sharded", "LoadBalanced"].includes(topologyType);
    }
    return false;
  } catch (err) {
    return false;
  }
};

const executeOrderCreation = async (userId, address, cartInfo, session, couponCode = null) => {
  const opts = session ? { session } : {};
  const deductedItems = [];
  let createdOrderId = null;
  let couponUsed = null;

  try {
    // 1. Stock deduction and check
    for (const item of cartInfo.items) {
      const qty = item.quantity;
      if (qty <= 0) continue;

      // Update variant stock atomically
      const updateResult = await Product.updateOne(
        { 
          _id: item.product._id, 
          "variants._id": item.variantId, 
          "variants.stock": { $gte: qty } 
        },
        { 
          $inc: { "variants.$.stock": -qty } 
        },
        opts
      );

      if (updateResult.modifiedCount !== 1) {
        throw new Error(`Insufficient stock for product "${item.nameSnapshot}" (${item.variantSnapshot}).`);
      }
      deductedItems.push({
        productId: item.product._id,
        variantId: item.variantId,
        quantity: qty
      });
    }

    // 2. Calculate values on the server side using the database snapshot values we processed
    const subtotal = cartInfo.items.reduce((sum, item) => sum + (item.priceSnapshot * item.quantity), 0);
    const catalogDiscount = cartInfo.items.reduce((sum, item) => sum + ((item.regularPrice - item.priceSnapshot) * item.quantity), 0);
    const shippingCharge = cartInfo.cartSummary.shipping;
    const tax = 0; // Tax is ₹0

    // 3. Process coupon if provided
    let couponSnapshot = null;
    let couponDiscount = 0;

    if (couponCode) {
      const couponValidation = await validateUserCoupon(userId, couponCode, subtotal);
      if (!couponValidation.success) {
        throw new Error(couponValidation.message);
      }

      // Concurrency-safe atomic conditional increment of usedCount
      const couponFilter = {
        _id: couponValidation.coupon._id,
        isDeleted: false,
        isActive: true
      };

      if (couponValidation.coupon.usageLimit) {
        couponFilter.usedCount = { $lt: couponValidation.coupon.usageLimit };
      }

      const couponUpdateResult = await Coupon.updateOne(
        couponFilter,
        { $inc: { usedCount: 1 } },
        opts
      );

      if (couponUpdateResult.modifiedCount !== 1) {
        throw new Error("Coupon usage limit has been reached.");
      }

      couponUsed = couponValidation.coupon;
      couponDiscount = couponValidation.discountAmount;
      couponSnapshot = {
        couponId: couponValidation.coupon._id,
        code: couponValidation.coupon.code,
        discountType: couponValidation.coupon.discountType,
        discountValue: couponValidation.coupon.discountValue,
        discountAmount: couponDiscount
      };
    }

    const finalAmount = Math.max(0, subtotal - couponDiscount) + shippingCharge + tax;

    // 4. Generate order number
    const orderNumber = await generateOrderNumber(opts);

    // 5. Build shipping address snapshot
    const shippingAddress = {
      fullName: address.fullName,
      phone: address.phone,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      landmark: address.landmark,
      city: address.city,
      state: address.state,
      pinCode: address.pinCode
    };

    // 6. Build items snapshot
    const orderItems = cartInfo.items.map(item => {
      const brandName = item.product.brand?.name || item.product.brand || "Brand";
      return {
        product: item.product._id,
        variantId: item.variantId,
        productName: item.nameSnapshot,
        brandName,
        variantDetails: item.variantSnapshot,
        image: item.imageSnapshot,
        quantity: item.quantity,
        regularPrice: item.regularPrice,
        salePrice: item.priceSnapshot,
        itemTotal: item.priceSnapshot * item.quantity,
        itemStatus: "ACTIVE",
        isStockRestored: false
      };
    });

    // 7. Create the Order
    const newOrder = new Order({
      user: userId,
      orderNumber,
      items: orderItems,
      shippingAddress,
      subtotal,
      discount: catalogDiscount,
      coupon: couponSnapshot,
      couponDiscount: couponDiscount,
      tax,
      shippingCharge,
      finalAmount,
      paymentMethod: "COD",
      paymentStatus: "PENDING",
      orderStatus: "PLACED"
    });

    await newOrder.save(opts);
    createdOrderId = newOrder._id;

    // 8. Clear the Cart
    await Cart.updateOne(
      { user: userId },
      { $set: { items: [] } },
      opts
    );

    return {
      success: true,
      message: "Order placed successfully.",
      orderNumber,
      orderId: newOrder._id
    };
  } catch (error) {
    if (!session) {
      // Manually rollback coupon usage if it was incremented
      if (couponUsed) {
        await Coupon.updateOne(
          { _id: couponUsed._id },
          { $inc: { usedCount: -1 } }
        ).catch(err => {
          console.error("Coupon usage rollback failed:", err);
        });
      }

      // Manually rollback already deducted stock since there is no session transaction
      for (const roll of deductedItems) {
        await Product.updateOne(
          { _id: roll.productId, "variants._id": roll.variantId },
          { $inc: { "variants.$.stock": roll.quantity } }
        ).catch(err => {
          console.error(`Rollback failed for product ${roll.productId}, variant ${roll.variantId}:`, err);
        });
      }
      if (createdOrderId) {
        await Order.deleteOne({ _id: createdOrderId }).catch(err => {
          console.error(`Order rollback delete failed for order ${createdOrderId}:`, err);
        });
      }
    }
    throw error;
  }
};

const createCODOrder = async (userId, addressId, couponCode = null) => {
  // A. Validate shipping address
  const address = await Address.findOne({ _id: addressId, userId });
  if (!address) {
    return { success: false, message: "Invalid shipping address or address does not belong to you." };
  }

  // B. Fetch and validate cart
  const cartInfo = await getCart(userId);
  if (!cartInfo || cartInfo.items.length === 0) {
    return { success: false, message: "Your cart is empty." };
  }
  if (!cartInfo.canCheckout) {
    return { success: false, message: "Your cart contains unavailable or out-of-stock items." };
  }

  // C. Execute using MongoDB Transaction when supported, or Safe Atomic Rollback Fallback
  if (checkTransactionSupport()) {
    let session = null;
    try {
      session = await mongoose.connection.startSession();
      session.startTransaction();
      const orderResult = await executeOrderCreation(userId, address, cartInfo, session, couponCode);
      await session.commitTransaction();
      session.endSession();
      return orderResult;
    } catch (err) {
      if (session) {
        await session.abortTransaction().catch(() => {});
        session.endSession();
      }
      console.error("Transaction failed during order creation:", err.message);

      // Check if error was specifically due to transaction capability failure on runtime
      const isTxnNotSupported = err.message && (
        err.message.includes("Transaction numbers are only allowed") ||
        err.message.includes("does not support transactions") ||
        err.message.includes("replica set member")
      );

      if (isTxnNotSupported) {
        // Fall back gracefully to standalone atomic rollback path
        try {
          return await executeOrderCreation(userId, address, cartInfo, null, couponCode);
        } catch (fallbackErr) {
          console.error("Fallback order creation failed, rollback executed:", fallbackErr.message);
          return { success: false, message: fallbackErr.message };
        }
      }

      return { success: false, message: err.message };
    }
  } else {
    // Standalone deployment path: Safe atomic stock reduction + rollback fallback
    try {
      const orderResult = await executeOrderCreation(userId, address, cartInfo, null, couponCode);
      return orderResult;
    } catch (err) {
      console.error("Standalone order creation failed, rollback executed:", err.message);
      return { success: false, message: err.message };
    }
  }
};

const getOrderById = async (userId, orderId) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return null;
  }
  return await Order.findOne({ _id: orderId, user: userId });
};

const getAdminOrders = async ({ search = "", page = 1, limit = 10, status = "" } = {}) => {
  const query = {};

  if (search && search.trim()) {
    const trimmed = search.trim();
    const searchRegex = new RegExp(trimmed, "i");

    const matchingUsers = await User.find({
      $or: [
        { fullName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex }
      ]
    }).select("_id");
    const userIds = matchingUsers.map((u) => u._id);

    query.$or = [
      { orderNumber: searchRegex },
      { user: { $in: userIds } },
      { "shippingAddress.fullName": searchRegex },
      { "shippingAddress.phone": searchRegex }
    ];
  }

  if (status && ["PLACED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"].includes(status)) {
    query.orderStatus = status;
  }

  const totalOrders = await Order.countDocuments(query);
  const parsedLimit = Math.max(1, parseInt(limit) || 10);
  const totalPages = Math.ceil(totalOrders / parsedLimit) || 1;
  const currentPage = Math.max(1, Math.min(parseInt(page) || 1, totalPages));
  const skip = (currentPage - 1) * parsedLimit;

  const orders = await Order.find(query)
    .populate("user", "fullName email phone")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parsedLimit)
    .lean();

  return {
    orders,
    totalOrders,
    totalPages,
    currentPage,
    limit: parsedLimit,
    search: search.trim(),
    status
  };
};

const getAdminOrderById = async (orderId) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return null;
  }
  return await Order.findById(orderId).populate("user", "fullName email phone");
};

const updateOrderStatus = async (orderId, nextStatus) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return { success: false, message: "Invalid order ID." };
  }

  const validStatuses = ["PLACED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"];
  if (!validStatuses.includes(nextStatus)) {
    return { success: false, message: `Invalid order status "${nextStatus}".` };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return { success: false, message: "Order not found." };
  }

  const currentStatus = order.orderStatus;
  if (currentStatus === nextStatus) {
    return { success: true, message: `Order is already ${nextStatus}.`, order };
  }

  const allowedTransitions = {
    PLACED: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["DELIVERED", "CANCELLED"],
    DELIVERED: ["RETURNED"],
    CANCELLED: [],
    RETURNED: []
  };

  const validNext = allowedTransitions[currentStatus] || [];
  if (!validNext.includes(nextStatus)) {
    return {
      success: false,
      message: `Invalid status transition from "${currentStatus}" to "${nextStatus}".`
    };
  }

  if (nextStatus === "CANCELLED") {
    return await cancelOrder(orderId, "Cancelled by Admin");
  }

  if (nextStatus === "RETURNED") {
    return {
      success: false,
      message: "Return requires a mandatory return reason. Please use the Return Order action."
    };
  }

  if (nextStatus === "DELIVERED" && order.paymentMethod === "COD") {
    order.paymentStatus = "COMPLETED";
  }

  order.orderStatus = nextStatus;
  await order.save();
  return { success: true, message: `Order status updated to ${nextStatus}.`, order };
};

const cancelOrder = async (orderId, reason = "") => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return { success: false, message: "Invalid order ID." };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return { success: false, message: "Order not found." };
  }

  if (order.orderStatus === "CANCELLED") {
    return { success: false, message: "Order is already cancelled." };
  }

  if (order.orderStatus === "DELIVERED" || order.orderStatus === "RETURNED") {
    return {
      success: false,
      message: `Cannot cancel an order with status "${order.orderStatus}".`
    };
  }

  // Stock restoration with atomic rollback protection
  const itemsToRestore = order.items.filter(
    (item) => item.itemStatus === "ACTIVE" && !item.isStockRestored
  );

  const restoredItems = [];
  try {
    for (const item of itemsToRestore) {
      const updateRes = await Product.updateOne(
        { _id: item.product, "variants._id": item.variantId },
        { $inc: { "variants.$.stock": item.quantity } }
      );
      if (updateRes.modifiedCount !== 1) {
        throw new Error(`Failed to restore stock for product "${item.productName}".`);
      }
      restoredItems.push(item);
    }
  } catch (err) {
    // Rollback previously restored items
    for (const roll of restoredItems) {
      await Product.updateOne(
        { _id: roll.product, "variants._id": roll.variantId },
        { $inc: { "variants.$.stock": -roll.quantity } }
      ).catch(() => {});
    }
    return {
      success: false,
      message: `Failed to restore stock during cancellation: ${err.message}`
    };
  }

  const now = new Date();
  itemsToRestore.forEach((item) => {
    item.isStockRestored = true;
    item.itemStatus = "CANCELLED";
    item.cancellationReason = reason || "Order cancelled by Admin";
    item.cancelledAt = now;
  });

  order.orderStatus = "CANCELLED";
  order.cancellationReason = reason || "Order cancelled by Admin";
  order.cancelledAt = now;

  await order.save();
  return { success: true, message: "Order cancelled and stock restored successfully.", order };
};

const cancelOrderItem = async (orderId, itemId, reason = "") => {
  if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
    return { success: false, message: "Invalid order or item ID." };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return { success: false, message: "Order not found." };
  }

  if (order.orderStatus === "DELIVERED" || order.orderStatus === "RETURNED") {
    return { success: false, message: `Cannot cancel an item from a "${order.orderStatus}" order.` };
  }

  const item = order.items.id(itemId);
  if (!item) {
    return { success: false, message: "Item not found in this order." };
  }

  if (item.itemStatus === "CANCELLED" || item.isStockRestored) {
    return { success: false, message: "Item is already cancelled." };
  }

  try {
    const updateRes = await Product.updateOne(
      { _id: item.product, "variants._id": item.variantId },
      { $inc: { "variants.$.stock": item.quantity } }
    );
    if (updateRes.modifiedCount !== 1) {
      return { success: false, message: `Failed to restore stock for "${item.productName}".` };
    }
  } catch (err) {
    return { success: false, message: `Stock update failed: ${err.message}` };
  }

  const now = new Date();
  item.isStockRestored = true;
  item.itemStatus = "CANCELLED";
  item.cancellationReason = reason || "Item cancelled by Admin";
  item.cancelledAt = now;

  // Check if ALL items in order are now cancelled
  const allCancelled = order.items.every((it) => it.itemStatus === "CANCELLED");
  if (allCancelled) {
    order.orderStatus = "CANCELLED";
    order.cancellationReason = "All items in order were cancelled.";
    order.cancelledAt = now;
  }

  await order.save();
  return { success: true, message: "Item cancelled and stock restored successfully.", order };
};

const returnOrder = async (orderId, reason) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return { success: false, message: "Invalid order ID." };
  }

  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    return { success: false, message: "A valid return reason (at least 3 characters) is mandatory." };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return { success: false, message: "Order not found." };
  }

  if (order.orderStatus !== "DELIVERED") {
    return { success: false, message: `Return is only allowed for delivered orders (current status: "${order.orderStatus}").` };
  }

  const itemsToReturn = order.items.filter(
    (item) => item.itemStatus === "ACTIVE" && !item.isStockRestored
  );

  const restoredItems = [];
  try {
    for (const item of itemsToReturn) {
      const updateRes = await Product.updateOne(
        { _id: item.product, "variants._id": item.variantId },
        { $inc: { "variants.$.stock": item.quantity } }
      );
      if (updateRes.modifiedCount !== 1) {
        throw new Error(`Failed to restore stock for product "${item.productName}".`);
      }
      restoredItems.push(item);
    }
  } catch (err) {
    for (const roll of restoredItems) {
      await Product.updateOne(
        { _id: roll.product, "variants._id": roll.variantId },
        { $inc: { "variants.$.stock": -roll.quantity } }
      ).catch(() => {});
    }
    return {
      success: false,
      message: `Failed to restore stock during return: ${err.message}`
    };
  }

  const now = new Date();
  itemsToReturn.forEach((item) => {
    item.isStockRestored = true;
    item.itemStatus = "RETURNED";
    item.returnReason = reason.trim();
    item.returnedAt = now;
  });

  order.orderStatus = "RETURNED";
  order.returnReason = reason.trim();
  order.returnedAt = now;

  await order.save();
  return { success: true, message: "Order marked as returned and stock restored successfully.", order };
};

const returnOrderItem = async (orderId, itemId, reason) => {
  if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
    return { success: false, message: "Invalid order or item ID." };
  }

  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    return { success: false, message: "A valid return reason (at least 3 characters) is mandatory." };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return { success: false, message: "Order not found." };
  }

  if (order.orderStatus !== "DELIVERED") {
    return { success: false, message: `Items can only be returned from delivered orders (current status: "${order.orderStatus}").` };
  }

  const item = order.items.id(itemId);
  if (!item) {
    return { success: false, message: "Item not found in this order." };
  }

  if (item.itemStatus !== "ACTIVE" || item.isStockRestored) {
    return { success: false, message: `Item cannot be returned (current item status: "${item.itemStatus}").` };
  }

  try {
    const updateRes = await Product.updateOne(
      { _id: item.product, "variants._id": item.variantId },
      { $inc: { "variants.$.stock": item.quantity } }
    );
    if (updateRes.modifiedCount !== 1) {
      return { success: false, message: `Failed to restore stock for "${item.productName}".` };
    }
  } catch (err) {
    return { success: false, message: `Stock update failed: ${err.message}` };
  }

  const now = new Date();
  item.isStockRestored = true;
  item.itemStatus = "RETURNED";
  item.returnReason = reason.trim();
  item.returnedAt = now;

  // Check if all non-cancelled items are now RETURNED
  const nonCancelled = order.items.filter((it) => it.itemStatus !== "CANCELLED");
  const allReturned = nonCancelled.length > 0 && nonCancelled.every((it) => it.itemStatus === "RETURNED");
  if (allReturned) {
    order.orderStatus = "RETURNED";
    order.returnReason = reason.trim();
    order.returnedAt = now;
  }

  await order.save();
  return { success: true, message: "Item marked as returned and stock restored successfully.", order };
};

export {
  createCODOrder,
  getOrderById,
  getAdminOrders,
  getAdminOrderById,
  updateOrderStatus,
  cancelOrder,
  cancelOrderItem,
  returnOrder,
  returnOrderItem
};
