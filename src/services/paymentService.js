import crypto from "crypto";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Cart from "../models/Cart.js";
import Address from "../models/Address.js";
import User from "../models/User.js";
import Coupon from "../models/Coupon.js";
import PaymentAttempt from "../models/PaymentAttempt.js";
import ProcessedWebhook from "../models/ProcessedWebhook.js";
import { getCart } from "./cartService.js";
import { validateUserCoupon } from "./couponService.js";
import { getRazorpayClient, getRazorpayKeyId, getRazorpayWebhookSecret } from "../config/razorpay.js";
import { getBestOfferForItem, consumeOfferUsage } from "./offerService.js";

const generateOrderNumber = async () => {
  const now = new Date();
  const dateStr =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");

  let orderNumber;
  let isUnique = false;

  while (!isUnique) {
    const randomStr = String(Math.floor(1000 + Math.random() * 9000));
    orderNumber = `ELV-${dateStr}-${randomStr}`;
    const existing = await Order.findOne({ orderNumber });
    if (!existing) {
      isUnique = true;
    }
  }

  return orderNumber;
};

/**
 * Verify Razorpay Checkout HMAC signature
 */
export const verifyPaymentSignature = (razorpayOrderId, razorpayPaymentId, razorpaySignature) => {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return false;
  }
  const secret = process.env.RAZORPAY_KEY_SECRET || "";
  const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
  const generatedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  if (generatedSignature.length !== razorpaySignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(generatedSignature, "utf8"),
    Buffer.from(razorpaySignature, "utf8")
  );
};

/**
 * Verify Razorpay Webhook HMAC signature on exact raw body buffer
 */
export const verifyWebhookSignature = (rawBodyBuffer, signature) => {
  if (!rawBodyBuffer || !signature) {
    return false;
  }
  const secret = getRazorpayWebhookSecret();
  if (!secret) {
    console.error("[RAZORPAY WEBHOOK] Missing RAZORPAY_WEBHOOK_SECRET.");
    return false;
  }

  const generatedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBodyBuffer)
    .digest("hex");

  if (generatedSignature.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(generatedSignature, "utf8"),
    Buffer.from(signature, "utf8")
  );
};

/**
 * Creates a Razorpay Order and saves an authoritative PaymentAttempt.
 * Guards against rapid double-clicks for the same checkoutAttemptId.
 */
export const createRazorpayOrder = async (userId, addressId, couponCode, checkoutAttemptId, options = {}) => {
  // 1. Address check
  const address = await Address.findOne({ _id: addressId, userId });
  if (!address) {
    return { success: false, message: "Selected delivery address not found." };
  }

  // 2. Concurrency & Idempotency check on checkoutAttemptId
  let existingAttempt = null;
  if (checkoutAttemptId) {
    existingAttempt = await PaymentAttempt.findOne({
      user: userId,
      checkoutAttemptId
    });

    if (existingAttempt) {
      if (existingAttempt.status === "COMPLETED") {
        return {
          success: false,
          message: "Payment for this checkout attempt has already been completed."
        };
      }

      if (existingAttempt.status === "CREATED" && existingAttempt.razorpayOrderId) {
        return {
          success: true,
          reused: true,
          orderId: existingAttempt.razorpayOrderId,
          razorpayOrderId: existingAttempt.razorpayOrderId,
          amount: existingAttempt.amount,
          currency: existingAttempt.currency,
          keyId: getRazorpayKeyId(),
          paymentAttemptId: existingAttempt._id.toString(),
          breakdown: {
            subtotal: existingAttempt.subtotal,
            couponDiscount: existingAttempt.couponDiscount,
            totalOfferDiscount: existingAttempt.totalOfferDiscount || 0,
            shippingCharge: existingAttempt.shippingCharge,
            finalAmount: existingAttempt.amount
          }
        };
      }

      if (existingAttempt.status === "PROCESSING") {
        return {
          success: false,
          message: "Payment is currently processing. Please check your orders or try again in a moment."
        };
      }

      if (existingAttempt.status === "FULFILLMENT_BLOCKED") {
        return {
          success: false,
          message: "A previous payment for this attempt requires refund reconciliation. Please initialize a new checkout."
        };
      }
    }
  }

  // 3. Cart live revalidation & Authoritative Snapshot Building
  const cartInfo = await getCart(userId, options);
  if (!cartInfo || !cartInfo.items || cartInfo.items.length === 0) {
    return { success: false, message: "Your cart is empty." };
  }
  if (!cartInfo.canCheckout) {
    return { success: false, message: "Your cart contains unavailable or out-of-stock items." };
  }

  // Aggregate duplicate variants
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

  const preparedItems = [];
  for (const item of aggregatedItems) {
    const qty = item.quantity;
    if (qty <= 0) continue;

    const pId = item.product?._id || item.product;
    const vId = item.variantId;

    const product = await Product.findOne({
      _id: pId,
      isDeleted: false,
      isListed: true
    })
      .populate({ path: "category", match: { isDeleted: false, isListed: true } })
      .populate({ path: "brand", match: { isDeleted: false, isListed: true } });

    if (!product || !product.category || !product.brand) {
      return {
        success: false,
        message: `Product "${item.nameSnapshot || "Item"}" is no longer available.`
      };
    }

    const rawVariants = Array.isArray(product.variants) ? product.variants : [];
    const variant = rawVariants.find(
      (v) => v && v._id.toString() === vId.toString() && v.isListed
    );

    if (!variant) {
      return {
        success: false,
        message: `Selected variant for "${product.name}" is no longer available.`
      };
    }

    if (variant.stock < qty) {
      return {
        success: false,
        message: `Insufficient stock for product "${product.name}" (${variant.color} / ${variant.storage}). Available: ${variant.stock}, requested: ${qty}.`
      };
    }

    const brandName = product.brand.name || "Brand";
    const variantDetails = `${variant.color} / ${variant.storage}`;
    const image =
      Array.isArray(variant.images) && variant.images.length > 0
        ? variant.images[0]
        : item.imageSnapshot || "";
    const regularPrice = variant.regularPrice || variant.salePrice;
    const salePrice = variant.salePrice;

    const offerEval = await getBestOfferForItem({
      productId: product._id,
      categoryId: product.category?._id || product.category,
      unitPrice: salePrice,
      quantity: qty,
      userId,
      referralCode: options.referralCode || null
    });

    const appliedOffer = offerEval.bestOffer;
    const offerDiscount = offerEval.totalOfferDiscount;
    const effectiveItemPrice = offerEval.effectiveItemPrice;
    const itemTotal = offerEval.itemTotal;

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
      appliedOfferId: appliedOffer ? appliedOffer._id : null,
      appliedOfferName: appliedOffer ? appliedOffer.name : "",
      appliedOfferScope: appliedOffer ? appliedOffer.scope : "",
      appliedOfferDiscountType: appliedOffer ? appliedOffer.discountType : "",
      appliedOfferDiscountValue: appliedOffer ? appliedOffer.discountValue : 0,
      offerDiscount,
      effectiveItemPrice,
      itemTotal
    });
  }

  if (preparedItems.length === 0) {
    return { success: false, message: "Your cart is empty." };
  }

  // 4. Financial Calculations
  const subtotal = preparedItems.reduce((sum, it) => sum + it.itemTotal, 0);
  const catalogDiscount = preparedItems.reduce(
    (sum, it) => sum + (it.regularPrice - it.salePrice) * it.quantity,
    0
  );
  const totalOfferDiscount = preparedItems.reduce(
    (sum, it) => sum + it.offerDiscount,
    0
  );
  const shippingCharge = cartInfo.cartSummary?.shipping ?? (subtotal >= 50000 ? 0 : 50);
  const tax = 0;

  let couponSnapshot = null;
  let couponDiscount = 0;
  if (couponCode) {
    const couponValidation = await validateUserCoupon(userId, couponCode, subtotal);
    if (couponValidation.success) {
      couponDiscount = couponValidation.discountAmount;
      couponSnapshot = {
        couponId: couponValidation.coupon._id,
        code: couponValidation.coupon.code,
        discountType: couponValidation.coupon.discountType,
        discountValue: couponValidation.coupon.discountValue,
        discountAmount: couponDiscount
      };
    }
  }

  const finalAmount = Math.max(0, subtotal - couponDiscount) + shippingCharge + tax;
  const amountInPaise = Math.round(finalAmount * 100);

  if (amountInPaise <= 0 || !Number.isInteger(amountInPaise)) {
    return { success: false, message: "Invalid order amount." };
  }

  // 5. Create Razorpay Order via SDK
  const razorpay = getRazorpayClient();
  const cleanAttemptId = checkoutAttemptId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 14);
  const receipt = `rcpt_${cleanAttemptId}_${Date.now().toString().slice(-4)}`;

  const rzpOrder = await razorpay.orders.create({
    amount: amountInPaise,
    currency: "INR",
    receipt,
    payment_capture: 1,
    notes: {
      userId: userId.toString(),
      checkoutAttemptId
    }
  });

  const shippingAddressSnapshot = {
    fullName: address.fullName,
    phone: address.phone,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 || "",
    landmark: address.landmark || "",
    city: address.city,
    state: address.state,
    pinCode: address.pinCode
  };

  // 6. Persist PaymentAttempt
  const paymentAttempt = new PaymentAttempt({
    user: userId,
    checkoutAttemptId,
    retryCount: existingAttempt && existingAttempt.status === "FAILED" ? existingAttempt.retryCount + 1 : 0,
    shippingAddress: shippingAddressSnapshot,
    items: preparedItems,
    subtotal,
    catalogDiscount,
    totalOfferDiscount,
    coupon: couponSnapshot,
    couponDiscount,
    shippingCharge,
    tax,
    amount: finalAmount,
    amountInPaise,
    currency: "INR",
    razorpayOrderId: rzpOrder.id,
    status: "CREATED"
  });

  await paymentAttempt.save();

  return {
    success: true,
    keyId: getRazorpayKeyId(),
    orderId: rzpOrder.id,
    amount: rzpOrder.amount,
    currency: "INR",
    prefill: {
      name: address.fullName,
      phone: address.phone
    }
  };
};

/**
 * SINGLE AUTHORITATIVE ORDER FINALIZATION ENGINE
 * Shared between Browser Callback (/payment/verify) and Webhook (/payment/webhook/razorpay).
 * Concurrency-safe via atomic findOneAndUpdate claim.
 */
export const finalizeSuccessfulPayment = async ({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature = null,
  user = null,
  webhookEventId = null
}) => {
  // 1. Locate PaymentAttempt
  const paymentAttempt = await PaymentAttempt.findOne({ razorpayOrderId });
  if (!paymentAttempt) {
    return { success: false, message: "Payment attempt not found for this Razorpay order." };
  }

  // Check user ownership if user context was provided
  if (user && user.id && paymentAttempt.user.toString() !== user.id.toString()) {
    return { success: false, message: "Unauthorized: Payment attempt does not belong to you." };
  }

  // 2. Check if already finalized or blocked
  if (paymentAttempt.status === "COMPLETED" && paymentAttempt.order) {
    const existingOrder = await Order.findById(paymentAttempt.order);
    if (existingOrder) {
      await Cart.updateOne({ user: paymentAttempt.user }, { $set: { items: [] } }).catch(() => {});
      return {
        success: true,
        order: existingOrder,
        orderNumber: existingOrder.orderNumber,
        orderId: existingOrder._id,
        isDuplicate: true
      };
    }
  }

  if (paymentAttempt.status === "FULFILLMENT_BLOCKED") {
    return {
      success: false,
      status: "FULFILLMENT_BLOCKED",
      message: paymentAttempt.reconciliationReason || "Payment was captured, but fulfillment is blocked."
    };
  }

  // Check if Order already exists by idempotencyKey
  const existingOrderByIdemp = await Order.findOne({ idempotencyKey: paymentAttempt.checkoutAttemptId });
  if (existingOrderByIdemp) {
    paymentAttempt.status = "COMPLETED";
    paymentAttempt.order = existingOrderByIdemp._id;
    await paymentAttempt.save().catch(() => {});
    await Cart.updateOne({ user: paymentAttempt.user }, { $set: { items: [] } }).catch(() => {});
    return {
      success: true,
      order: existingOrderByIdemp,
      orderNumber: existingOrderByIdemp.orderNumber,
      orderId: existingOrderByIdemp._id,
      isDuplicate: true
    };
  }

  // 3. Atomic state transition: claim CREATED -> PROCESSING (or recover stale PROCESSING)
  const staleThreshold = new Date(Date.now() - 45000); // 45 seconds timeout for stale processing
  const claimed = await PaymentAttempt.findOneAndUpdate(
    {
      _id: paymentAttempt._id,
      $or: [
        { status: "CREATED" },
        { status: "FAILED" },
        { status: "PROCESSING", processingStartedAt: { $lt: staleThreshold } }
      ]
    },
    {
      $set: {
        status: "PROCESSING",
        processingStartedAt: new Date(),
        razorpayPaymentId: razorpayPaymentId || paymentAttempt.razorpayPaymentId,
        razorpaySignature: razorpaySignature || paymentAttempt.razorpaySignature
      }
    },
    { returnDocument: "after" }
  );

  if (!claimed) {
    // Another thread has claimed PROCESSING or already COMPLETED.
    // Poll up to 3 times to return finalized result cleanly
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const refreshed = await PaymentAttempt.findById(paymentAttempt._id);
      if (refreshed && refreshed.status === "COMPLETED" && refreshed.order) {
        const order = await Order.findById(refreshed.order);
        if (order) {
          return {
            success: true,
            order,
            orderNumber: order.orderNumber,
            orderId: order._id,
            isDuplicate: true
          };
        }
      }
      if (refreshed && refreshed.status === "FULFILLMENT_BLOCKED") {
        return {
          success: false,
          status: "FULFILLMENT_BLOCKED",
          message: refreshed.reconciliationReason
        };
      }
    }
    return {
      success: true,
      isProcessing: true,
      message: "Payment is currently being finalized."
    };
  }

  // 4. API Verification from Razorpay
  const razorpay = getRazorpayClient();
  let paymentDetails;
  try {
    paymentDetails = await razorpay.payments.fetch(razorpayPaymentId);
  } catch (err) {
    await PaymentAttempt.updateOne(
      { _id: paymentAttempt._id },
      { $set: { status: "FAILED", failureReason: `Failed to fetch payment details: ${err.message}` } }
    );
    return { success: false, message: "Payment verification failed with payment gateway." };
  }

  // Verify Order ID, Amount, Currency, and Captured Status
  if (paymentDetails.order_id !== razorpayOrderId) {
    await PaymentAttempt.updateOne(
      { _id: paymentAttempt._id },
      { $set: { status: "FAILED", failureReason: "Mismatched Razorpay Order ID on payment." } }
    );
    return { success: false, message: "Payment verification failed: Mismatched order." };
  }

  if (paymentDetails.amount !== paymentAttempt.amountInPaise) {
    await PaymentAttempt.updateOne(
      { _id: paymentAttempt._id },
      { $set: { status: "FAILED", failureReason: "Payment amount mismatch." } }
    );
    return { success: false, message: "Payment verification failed: Amount mismatch." };
  }

  if (paymentDetails.currency !== "INR") {
    await PaymentAttempt.updateOne(
      { _id: paymentAttempt._id },
      { $set: { status: "FAILED", failureReason: "Invalid payment currency." } }
    );
    return { success: false, message: "Payment verification failed: Invalid currency." };
  }

  if (paymentDetails.status !== "captured") {
    await PaymentAttempt.updateOne(
      { _id: paymentAttempt._id },
      { $set: { status: "FAILED", failureReason: `Payment is not captured. Status: ${paymentDetails.status}` } }
    );
    return { success: false, message: `Payment is not captured (status: ${paymentDetails.status}).` };
  }

  // 5. Atomic Stock Verification & Decrement
  const deductedItems = [];
  let fulfillmentBlocked = false;
  let blockedReason = "";

  for (const item of paymentAttempt.items) {
    const qty = item.quantity;
    const pId = item.product;
    const vId = item.variantId;

    // Verify live catalog status
    const product = await Product.findOne({
      _id: pId,
      isDeleted: false,
      isListed: true
    })
      .populate({ path: "category", match: { isDeleted: false, isListed: true } })
      .populate({ path: "brand", match: { isDeleted: false, isListed: true } });

    if (!product || !product.category || !product.brand) {
      fulfillmentBlocked = true;
      blockedReason = `Product "${item.productName}" is no longer active in catalog.`;
      break;
    }

    const rawVariants = Array.isArray(product.variants) ? product.variants : [];
    const variant = rawVariants.find(
      (v) => v && v._id.toString() === vId.toString() && v.isListed
    );

    if (!variant) {
      fulfillmentBlocked = true;
      blockedReason = `Variant "${item.variantDetails}" for "${product.name}" is no longer available.`;
      break;
    }

    if (variant.stock < qty) {
      fulfillmentBlocked = true;
      blockedReason = `Insufficient stock for product "${product.name}" (${item.variantDetails}). Available: ${variant.stock}, requested: ${qty}.`;
      break;
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
      }
    );

    if (updateResult.modifiedCount !== 1) {
      fulfillmentBlocked = true;
      blockedReason = `Stock ran out for product "${product.name}" (${item.variantDetails}).`;
      break;
    }

    deductedItems.push({
      productId: product._id,
      variantId: variant._id,
      quantity: qty
    });
  }

  // 6. Handle Captured Payment + Out-of-Stock / Unavailable (FULFILLMENT_BLOCKED)
  if (fulfillmentBlocked) {
    // Rollback any items we decremented before the failure
    for (const roll of deductedItems) {
      await Product.updateOne(
        { _id: roll.productId, "variants._id": roll.variantId },
        { $inc: { "variants.$.stock": roll.quantity } }
      ).catch((err) => console.error("Rollback error:", err));
    }

    await PaymentAttempt.updateOne(
      { _id: paymentAttempt._id },
      {
        $set: {
          status: "FULFILLMENT_BLOCKED",
          reconciliationStatus: "REQUIRES_REFUND",
          reconciliationReason: blockedReason,
          capturedAmount: paymentDetails.amount,
          razorpayPaymentId
        }
      }
    );

    return {
      success: false,
      status: "FULFILLMENT_BLOCKED",
      message: `Your payment of ₹${(paymentDetails.amount / 100).toFixed(2)} was successfully captured, but item fulfillment could not be completed: ${blockedReason}. A full refund will be processed by our team.`
    };
  }

  // 7. Atomic Coupon Consumption (Only on successful order fulfillment)
  let couponUsed = null;
  if (paymentAttempt.coupon && paymentAttempt.coupon.couponId) {
    try {
      const couponId = paymentAttempt.coupon.couponId;
      const couponUpdate = await Coupon.updateOne(
        {
          _id: couponId,
          isDeleted: false,
          isActive: true,
          $or: [
            { usageLimit: null },
            { usageLimit: { $exists: false } },
            { $expr: { $lt: ["$usedCount", "$usageLimit"] } }
          ]
        },
        { $inc: { usedCount: 1 } }
      );
      if (couponUpdate.modifiedCount === 1) {
        couponUsed = couponId;
      }
    } catch (err) {
      console.warn("Coupon consumption warning:", err.message);
    }
  }

  // 8. Order Creation & Persistence
  let orderSaved = false;
  let newOrder;
  try {
    const orderNumber = await generateOrderNumber();
    const orderItems = paymentAttempt.items.map((it) => ({
      product: it.product,
      variantId: it.variantId,
      sku: it.sku || "",
      productName: it.productName,
      brandName: it.brandName,
      variantDetails: it.variantDetails,
      image: it.image,
      quantity: it.quantity,
      regularPrice: it.regularPrice,
      salePrice: it.salePrice,
      appliedOfferId: it.appliedOfferId || null,
      appliedOfferName: it.appliedOfferName || "",
      appliedOfferScope: it.appliedOfferScope || "",
      appliedOfferDiscountType: it.appliedOfferDiscountType || "",
      appliedOfferDiscountValue: it.appliedOfferDiscountValue || 0,
      offerDiscount: it.offerDiscount || 0,
      effectiveItemPrice: it.effectiveItemPrice || it.salePrice,
      itemTotal: it.itemTotal,
      itemStatus: "ACTIVE",
      isStockRestored: false
    }));

    newOrder = new Order({
      user: paymentAttempt.user,
      orderNumber,
      idempotencyKey: paymentAttempt.checkoutAttemptId,
      items: orderItems,
      shippingAddress: paymentAttempt.shippingAddress,
      subtotal: paymentAttempt.subtotal,
      discount: paymentAttempt.catalogDiscount,
      totalOfferDiscount: paymentAttempt.totalOfferDiscount || 0,
      coupon: paymentAttempt.coupon,
      couponDiscount: paymentAttempt.couponDiscount,
      tax: paymentAttempt.tax,
      shippingCharge: paymentAttempt.shippingCharge,
      finalAmount: paymentAttempt.amount,
      paymentMethod: "RAZORPAY",
      paymentStatus: "COMPLETED",
      orderStatus: "PLACED",
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: razorpaySignature || "",
      paymentVerifiedAt: new Date()
    });

    await newOrder.save();
    orderSaved = true;

    // Update PaymentAttempt to COMPLETED
    paymentAttempt.status = "COMPLETED";
    paymentAttempt.order = newOrder._id;
    paymentAttempt.razorpayPaymentId = razorpayPaymentId;
    paymentAttempt.razorpaySignature = razorpaySignature || paymentAttempt.razorpaySignature;
    paymentAttempt.paymentVerifiedAt = new Date();
    paymentAttempt.capturedAmount = paymentDetails.amount;
    if (webhookEventId && !paymentAttempt.processedWebhooks.includes(webhookEventId)) {
      paymentAttempt.processedWebhooks.push(webhookEventId);
    }
    await paymentAttempt.save();

    // Consume offer usage for applied offers
    for (const it of paymentAttempt.items) {
      if (it.appliedOfferId) {
        await consumeOfferUsage(it.appliedOfferId).catch(() => {});
      }
    }

    // Clear Cart safely
    await Cart.updateOne({ user: paymentAttempt.user }, { $set: { items: [] } }).catch((err) => {
      console.error("Cart clear failure after order save:", err);
    });

    return {
      success: true,
      order: newOrder,
      orderNumber: newOrder.orderNumber,
      orderId: newOrder._id
    };
  } catch (error) {
    if (orderSaved) {
      // Order is safely persisted. Re-throw without deleting order or restoring stock.
      throw error;
    }

    // Pre-save failure: Revert coupon and stock
    if (couponUsed) {
      await Coupon.updateOne({ _id: couponUsed }, { $inc: { usedCount: -1 } }).catch(() => {});
    }
    for (const roll of deductedItems) {
      await Product.updateOne(
        { _id: roll.productId, "variants._id": roll.variantId },
        { $inc: { "variants.$.stock": roll.quantity } }
      ).catch(() => {});
    }

    await PaymentAttempt.updateOne(
      { _id: paymentAttempt._id },
      { $set: { status: "PROCESSING", failureReason: `Order persistence failure: ${error.message}` } }
    );

    throw error;
  }
};

/**
 * Handle incoming webhook event safely with atomic deduplication
 */
export const processWebhookEvent = async (rawBodyBuffer, signature, webhookHeaderId = null) => {
  // 1. Signature Verification
  const isValid = verifyWebhookSignature(rawBodyBuffer, signature);
  if (!isValid) {
    throw new Error("Invalid Razorpay webhook signature.");
  }

  // 2. Parse Event
  const event = JSON.parse(rawBodyBuffer.toString("utf8"));
  const eventId =
    webhookHeaderId ||
    event.id ||
    `${event.event}_${event.payload?.payment?.entity?.id || event.payload?.order?.entity?.id}_${event.created_at}`;

  // 3. Atomic Event Deduplication via ProcessedWebhook
  try {
    await ProcessedWebhook.create({
      eventId,
      eventType: event.event,
      razorpayOrderId:
        event.payload?.payment?.entity?.order_id || event.payload?.order?.entity?.id || null,
      razorpayPaymentId: event.payload?.payment?.entity?.id || null
    });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate webhook delivery, ignore safely
      return { success: true, isDuplicate: true, message: "Webhook event already processed." };
    }
    throw err;
  }

  // 4. Dispatch Event
  if (event.event === "payment.captured" || event.event === "order.paid") {
    const razorpayOrderId =
      event.payload?.payment?.entity?.order_id || event.payload?.order?.entity?.id;
    const razorpayPaymentId = event.payload?.payment?.entity?.id;

    if (razorpayOrderId && razorpayPaymentId) {
      return await finalizeSuccessfulPayment({
        razorpayOrderId,
        razorpayPaymentId,
        webhookEventId: eventId
      });
    }
  } else if (event.event === "payment.failed") {
    const razorpayOrderId = event.payload?.payment?.entity?.order_id;
    if (razorpayOrderId) {
      const paymentAttempt = await PaymentAttempt.findOne({ razorpayOrderId });
      if (paymentAttempt) {
        // Section 33: A late payment.failed event must NEVER overwrite COMPLETED or FULFILLMENT_BLOCKED!
        if (
          paymentAttempt.status !== "COMPLETED" &&
          paymentAttempt.status !== "FULFILLMENT_BLOCKED" &&
          paymentAttempt.status !== "PROCESSING"
        ) {
          paymentAttempt.status = "FAILED";
          paymentAttempt.failureReason =
            event.payload?.payment?.entity?.error_description || "Payment failed at gateway";
          await paymentAttempt.save();
        }
      }
    }
  }

  return { success: true, event: event.event };
};
