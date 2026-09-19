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

const executeOrderCreation = async (userId, address, cartInfo, session, couponCode = null, idempotencyKey = null) => {
  const opts = session ? { session } : {};
  const deductedItems = [];
  let createdOrderId = null;
  let orderSaved = false;
  let couponUsed = null;

  try {
    // Check if an order already exists for this idempotency key
    if (idempotencyKey) {
      const existingOrder = await Order.findOne({ idempotencyKey, user: userId }).session(session || null);
      if (existingOrder) {
        // Ensure cart is cleared (e.g. prior cart-clear failed)
        await Cart.updateOne(
          { user: userId },
          { $set: { items: [] } },
          opts
        ).catch(() => {});

        return {
          success: true,
          message: "Order placed successfully.",
          orderNumber: existingOrder.orderNumber,
          orderId: existingOrder._id,
          isDuplicate: true
        };
      }
    }

    // 1. Aggregate cart items by variantId to handle accidental duplicates safely
    const aggregatedMap = new Map();
    for (const item of cartInfo.items) {
      const pId = item.product?._id ? item.product._id.toString() : item.product.toString();
      const vId = item.variantId ? item.variantId.toString() : "";
      const key = `${pId}_${vId}`;
      if (!aggregatedMap.has(key)) {
        aggregatedMap.set(key, { ...item, quantity: item.quantity });
      } else {
        aggregatedMap.get(key).quantity += item.quantity;
      }
    }
    const aggregatedItems = Array.from(aggregatedMap.values());
    if (aggregatedItems.length === 0) {
      throw new Error("Your cart is empty.");
    }

    // 2. Authoritative Verification, Snapshot Building, and Atomic Stock Deduction
    const preparedItems = [];
    for (const item of aggregatedItems) {
      const qty = item.quantity;
      if (qty <= 0) continue;

      const pId = item.product?._id || item.product;
      const vId = item.variantId;

      // Authoritative fetch from DB with populated category & brand
      const product = await Product.findOne({
        _id: pId,
        isDeleted: false,
        isListed: true
      })
      .populate({
        path: "category",
        match: { isDeleted: false, isListed: true }
      })
      .populate({
        path: "brand",
        match: { isDeleted: false, isListed: true }
      })
      .session(session || null);

      if (!product || !product.category || !product.brand) {
        throw new Error(`Product "${item.nameSnapshot || "Item"}" is no longer available.`);
      }

      const rawVariants = Array.isArray(product.variants) ? product.variants : [];
      const variant = rawVariants.find(
        (v) => v && v._id.toString() === vId.toString() && v.isListed
      );

      if (!variant) {
        throw new Error(`Selected variant for "${product.name}" is no longer available.`);
      }

      if (variant.stock < qty) {
        throw new Error(
          `Insufficient stock for product "${product.name}" (${variant.color} / ${variant.storage}). Available: ${variant.stock}, requested: ${qty}.`
        );
      }

      // Atomic conditional decrement using $elemMatch
      const updateResult = await Product.updateOne(
        {
          _id: product._id,
          variants: {
            $elemMatch: {
              _id: variant._id,
              stock: { $gte: qty }
            }
          }
        },
        {
          $inc: { "variants.$.stock": -qty }
        },
        opts
      );

      if (updateResult.modifiedCount !== 1) {
        throw new Error(
          `Insufficient stock for product "${product.name}" (${variant.color} / ${variant.storage}).`
        );
      }

      deductedItems.push({
        productId: product._id,
        variantId: variant._id,
        quantity: qty,
        productName: product.name
      });

      // Authoritative snapshot preparation
      const brandName = product.brand.name || "Brand";
      const variantDetails = `${variant.color} / ${variant.storage}`;
      const image = (Array.isArray(variant.images) && variant.images.length > 0)
        ? variant.images[0]
        : (item.imageSnapshot || "");
      const regularPrice = variant.regularPrice || variant.salePrice;
      const salePrice = variant.salePrice;
      // offerDiscount is reserved for future Offer module; catalog difference is regularPrice - salePrice
      const offerDiscount = 0;
      const itemTotal = salePrice * qty;

      preparedItems.push({
        product: product._id,
        variantId: variant._id,
        sku: variant.sku || "",
        productName: product.name,
        brandName,
        variantDetails,
        image,
        quantity: qty,
        regularPrice,
        salePrice,
        offerDiscount,
        itemTotal,
        itemStatus: "ACTIVE",
        isStockRestored: false
      });
    }

    // 3. Financial calculations using authoritative values
    const subtotal = preparedItems.reduce((sum, it) => sum + it.itemTotal, 0);
    const catalogDiscount = preparedItems.reduce(
      (sum, it) => sum + ((it.regularPrice - it.salePrice) * it.quantity),
      0
    );
    const shippingCharge = cartInfo.cartSummary?.shipping ?? (subtotal >= 50000 ? 0 : 50);
    const tax = 0;

    // 4. Process coupon if provided
    let couponSnapshot = null;
    let couponDiscount = 0;

    if (couponCode) {
      const couponValidation = await validateUserCoupon(userId, couponCode, subtotal);
      if (!couponValidation.success) {
        throw new Error(couponValidation.message);
      }

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
    const orderNumber = await generateOrderNumber(opts);

    const shippingAddress = {
      fullName: address.fullName,
      phone: address.phone,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 || "",
      landmark: address.landmark || "",
      city: address.city,
      state: address.state,
      pinCode: address.pinCode
    };

    const newOrder = new Order({
      user: userId,
      orderNumber,
      idempotencyKey: idempotencyKey || undefined,
      items: preparedItems,
      shippingAddress,
      subtotal,
      discount: catalogDiscount,
      coupon: couponSnapshot,
      couponDiscount,
      tax,
      shippingCharge,
      finalAmount,
      paymentMethod: "COD",
      paymentStatus: "PENDING",
      orderStatus: "PLACED"
    });

    await newOrder.save(opts);
    createdOrderId = newOrder._id;
    orderSaved = true;

    // 5. Clear the Cart
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
      // Check if error is due to concurrent idempotencyKey duplicate insertion
      if (error.code === 11000 && error.keyPattern && error.keyPattern.idempotencyKey) {
        // Rollback any stock we deducted
        for (const roll of deductedItems) {
          await Product.updateOne(
            { _id: roll.productId, "variants._id": roll.variantId },
            { $inc: { "variants.$.stock": roll.quantity } }
          ).catch((err) => console.error(`Rollback failed for product ${roll.productId}:`, err));
        }
        if (couponUsed) {
          await Coupon.updateOne(
            { _id: couponUsed._id },
            { $inc: { usedCount: -1 } }
          ).catch((err) => console.error("Coupon rollback failed:", err));
        }
        // Retrieve winning order and return
        if (idempotencyKey) {
          const existingOrder = await Order.findOne({ idempotencyKey, user: userId });
          if (existingOrder) {
            await Cart.updateOne({ user: userId }, { $set: { items: [] } }).catch(() => {});
            return {
              success: true,
              message: "Order placed successfully.",
              orderNumber: existingOrder.orderNumber,
              orderId: existingOrder._id,
              isDuplicate: true
            };
          }
        }
      }

      if (orderSaved) {
        // Order was successfully created and saved! Stock was legitimately deducted.
        // Cart clear failure occurred after order save.
        // DO NOT delete the order or restore stock!
        // Re-throw so retry or caller is aware, and retry will clean up cart via idempotency.
        throw error;
      }

      // Pre-save failure: Revert coupon usage
      if (couponUsed) {
        await Coupon.updateOne(
          { _id: couponUsed._id },
          { $inc: { usedCount: -1 } }
        ).catch((err) => {
          console.error("Coupon usage rollback failed:", err);
        });
      }

      // Revert ALL deducted stock items
      for (const roll of deductedItems) {
        await Product.updateOne(
          { _id: roll.productId, "variants._id": roll.variantId },
          { $inc: { "variants.$.stock": roll.quantity } }
        ).catch((err) => {
          console.error(`Rollback failed for product ${roll.productId}, variant ${roll.variantId}:`, err);
        });
      }

      if (createdOrderId) {
        await Order.deleteOne({ _id: createdOrderId }).catch((err) => {
          console.error(`Order rollback delete failed for order ${createdOrderId}:`, err);
        });
      }
    }
    throw error;
  }
};

const createCODOrder = async (userId, addressId, couponCode = null, idempotencyKey = null) => {
  // A. Validate shipping address
  const address = await Address.findOne({ _id: addressId, userId });
  if (!address) {
    return { success: false, message: "Invalid shipping address or address does not belong to you." };
  }

  // Idempotency early-check before fetching cart
  if (idempotencyKey) {
    const existingOrder = await Order.findOne({ idempotencyKey, user: userId });
    if (existingOrder) {
      await Cart.updateOne({ user: userId }, { $set: { items: [] } }).catch(() => {});
      return {
        success: true,
        message: "Order placed successfully.",
        orderNumber: existingOrder.orderNumber,
        orderId: existingOrder._id,
        isDuplicate: true
      };
    }
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
      const orderResult = await executeOrderCreation(userId, address, cartInfo, session, couponCode, idempotencyKey);
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
        try {
          return await executeOrderCreation(userId, address, cartInfo, null, couponCode, idempotencyKey);
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
      const orderResult = await executeOrderCreation(userId, address, cartInfo, null, couponCode, idempotencyKey);
      return orderResult;
    } catch (err) {
      console.error("Standalone order creation failed, rollback executed:", err.message);
      return { success: false, message: err.message };
    }
  }
};

const getUserOrders = async (userId, { page = 1, limit = 10 } = {}) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return {
      orders: [],
      totalOrders: 0,
      totalPages: 1,
      currentPage: 1,
      limit: 10
    };
  }

  const parsedLimit = Math.max(1, parseInt(limit, 10) || 10);
  const totalOrders = await Order.countDocuments({ user: userId });
  const totalPages = Math.ceil(totalOrders / parsedLimit) || 1;
  const currentPage = Math.max(1, Math.min(parseInt(page, 10) || 1, totalPages));
  const skip = (currentPage - 1) * parsedLimit;

  const orders = await Order.find({ user: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parsedLimit);

  return {
    orders,
    totalOrders,
    totalPages,
    currentPage,
    limit: parsedLimit
  };
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

  if (status && ["PLACED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED"].includes(status)) {
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

  const validStatuses = ["PLACED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED"];
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
    SHIPPED: ["OUT_FOR_DELIVERY", "CANCELLED"],
    OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
    DELIVERED: [],
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
  const appliedReason = (typeof reason === "string" && reason.trim().length > 0) ? reason.trim() : "Order cancelled";
  itemsToRestore.forEach((item) => {
    item.isStockRestored = true;
    item.itemStatus = "CANCELLED";
    item.cancellationReason = appliedReason;
    item.cancelledAt = now;
  });

  order.orderStatus = "CANCELLED";
  order.cancellationReason = appliedReason;
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

const restoreOrderReturnStock = async (order, reason) => {
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

  return { success: true, restoredItems };
};

const requestReturn = async (orderId, userId, reason) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return { success: false, message: "Invalid order ID." };
  }

  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    return { success: false, message: "A valid return reason (at least 3 characters) is mandatory." };
  }

  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) {
    return { success: false, message: "Order not found." };
  }

  if (order.orderStatus !== "DELIVERED") {
    return { success: false, message: `Return request is only allowed for delivered orders (current status: "${order.orderStatus}").` };
  }

  const currentReturnStatus = order.returnRequest?.status || "NONE";
  if (currentReturnStatus === "PENDING") {
    return { success: false, message: "A return request is already pending review for this order." };
  }
  if (currentReturnStatus === "APPROVED" || order.orderStatus === "RETURNED") {
    return { success: false, message: "This order has already been returned." };
  }
  if (currentReturnStatus === "REJECTED") {
    return { success: false, message: "The return request for this order was previously rejected." };
  }

  const hasPendingItem = order.items.some(
    (it) => it.returnRequest && it.returnRequest.status === "PENDING"
  );
  if (hasPendingItem) {
    return { success: false, message: "An item in this order already has a return request pending review." };
  }

  order.returnRequest = {
    status: "PENDING",
    reason: reason.trim(),
    requestedAt: new Date(),
    reviewedAt: null,
    rejectionReason: null
  };

  await order.save();
  return { success: true, message: "Return request submitted successfully.", order };
};

const requestReturnItem = async (orderId, userId, itemId, reason) => {
  if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
    return { success: false, message: "Invalid order or item ID." };
  }

  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    return { success: false, message: "A valid return reason (at least 3 characters) is mandatory." };
  }

  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) {
    return { success: false, message: "Order not found." };
  }

  if (order.orderStatus !== "DELIVERED") {
    return { success: false, message: `Return request is only allowed for delivered orders (current status: "${order.orderStatus}").` };
  }

  if (order.returnRequest && order.returnRequest.status === "PENDING") {
    return { success: false, message: "A full order return request is already pending review for this order." };
  }

  const item = order.items.id(itemId);
  if (!item) {
    return { success: false, message: "Item not found in this order." };
  }

  if (item.itemStatus !== "ACTIVE") {
    return { success: false, message: `Cannot return an item with status "${item.itemStatus}".` };
  }

  const itemReturnStatus = item.returnRequest?.status || "NONE";
  if (itemReturnStatus === "PENDING") {
    return { success: false, message: "A return request is already pending review for this item." };
  }
  if (itemReturnStatus === "APPROVED" || item.itemStatus === "RETURNED") {
    return { success: false, message: "This item has already been returned." };
  }
  if (itemReturnStatus === "REJECTED") {
    return { success: false, message: "The return request for this item was previously rejected." };
  }

  item.returnRequest = {
    status: "PENDING",
    reason: reason.trim(),
    requestedAt: new Date(),
    reviewedAt: null,
    rejectionReason: null
  };

  await order.save();
  return { success: true, message: "Item return request submitted successfully.", order };
};

const approveReturnRequest = async (orderId) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return { success: false, message: "Invalid order ID." };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return { success: false, message: "Order not found." };
  }

  if (order.orderStatus !== "DELIVERED") {
    return { success: false, message: `Only delivered orders can have returns approved (current status: "${order.orderStatus}").` };
  }

  if (!order.returnRequest || order.returnRequest.status !== "PENDING") {
    return { success: false, message: `No pending return request found for this order (current request status: "${order.returnRequest?.status || "NONE"}").` };
  }

  const returnReason = order.returnRequest.reason || "Return approved by admin";
  const stockRes = await restoreOrderReturnStock(order, returnReason);
  if (!stockRes.success) {
    return stockRes;
  }

  const now = new Date();
  order.orderStatus = "RETURNED";
  order.returnReason = returnReason;
  order.returnedAt = now;

  order.returnRequest.status = "APPROVED";
  order.returnRequest.reviewedAt = now;

  // Also update item-level returnRequest status if present
  order.items.forEach((it) => {
    if (it.itemStatus === "RETURNED" && it.returnRequest) {
      it.returnRequest.status = "APPROVED";
      it.returnRequest.reviewedAt = now;
    }
  });

  await order.save();
  return { success: true, message: "Return request approved, order marked as returned, and stock restored.", order };
};

const rejectReturnRequest = async (orderId, rejectionReason) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return { success: false, message: "Invalid order ID." };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return { success: false, message: "Order not found." };
  }

  if (!order.returnRequest || order.returnRequest.status !== "PENDING") {
    return { success: false, message: `No pending return request found for this order (current request status: "${order.returnRequest?.status || "NONE"}").` };
  }

  if (!rejectionReason || typeof rejectionReason !== "string" || rejectionReason.trim().length < 3) {
    return { success: false, message: "A valid rejection reason (at least 3 characters) is required." };
  }

  const reason = rejectionReason.trim();

  order.returnRequest.status = "REJECTED";
  order.returnRequest.reviewedAt = new Date();
  order.returnRequest.rejectionReason = reason;

  await order.save();
  return { success: true, message: "Return request rejected successfully.", order };
};

const approveReturnItemRequest = async (orderId, itemId) => {
  if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
    return { success: false, message: "Invalid order or item ID." };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return { success: false, message: "Order not found." };
  }

  if (order.orderStatus !== "DELIVERED") {
    return { success: false, message: `Only delivered orders can have item returns approved (current status: "${order.orderStatus}").` };
  }

  const item = order.items.id(itemId);
  if (!item) {
    return { success: false, message: "Item not found in this order." };
  }

  if (!item.returnRequest || item.returnRequest.status !== "PENDING") {
    return { success: false, message: `No pending return request found for this item (current status: "${item.returnRequest?.status || "NONE"}").` };
  }

  if (item.itemStatus !== "ACTIVE" || item.isStockRestored) {
    return { success: false, message: "Item is not eligible for return approval." };
  }

  // Restore stock atomically for this item
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
  const returnReason = item.returnRequest.reason || "Return approved by admin";
  item.itemStatus = "RETURNED";
  item.isStockRestored = true;
  item.returnReason = returnReason;
  item.returnedAt = now;
  item.returnRequest.status = "APPROVED";
  item.returnRequest.reviewedAt = now;

  // If NO active items remain in the order, mark order as RETURNED
  const hasActiveItems = order.items.some((it) => it.itemStatus === "ACTIVE");
  if (!hasActiveItems) {
    order.orderStatus = "RETURNED";
    order.returnReason = "All items in order were returned.";
    order.returnedAt = now;
    if (order.returnRequest) {
      order.returnRequest.status = "APPROVED";
      order.returnRequest.reviewedAt = now;
    }
  }

  await order.save();
  return { success: true, message: "Item return request approved and stock restored.", order };
};

const rejectReturnItemRequest = async (orderId, itemId, rejectionReason) => {
  if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
    return { success: false, message: "Invalid order or item ID." };
  }

  if (!rejectionReason || typeof rejectionReason !== "string" || rejectionReason.trim().length < 3) {
    return { success: false, message: "A valid rejection reason (at least 3 characters) is required." };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return { success: false, message: "Order not found." };
  }

  if (order.orderStatus !== "DELIVERED") {
    return { success: false, message: `Only delivered orders can have item returns rejected (current status: "${order.orderStatus}").` };
  }

  const item = order.items.id(itemId);
  if (!item) {
    return { success: false, message: "Item not found in this order." };
  }

  if (!item.returnRequest || item.returnRequest.status !== "PENDING") {
    return { success: false, message: `No pending return request found for this item (current status: "${item.returnRequest?.status || "NONE"}").` };
  }

  const reason = rejectionReason.trim();

  item.returnRequest.status = "REJECTED";
  item.returnRequest.reviewedAt = new Date();
  item.returnRequest.rejectionReason = reason;

  await order.save();
  return { success: true, message: "Item return request rejected successfully.", order };
};

export {
  createCODOrder,
  getUserOrders,
  getOrderById,
  getAdminOrders,
  getAdminOrderById,
  updateOrderStatus,
  cancelOrder,
  cancelOrderItem,
  requestReturn,
  requestReturnItem,
  approveReturnRequest,
  rejectReturnRequest,
  approveReturnItemRequest,
  rejectReturnItemRequest
};
