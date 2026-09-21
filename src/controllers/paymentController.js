import * as paymentService from "../services/paymentService.js";
import PaymentAttempt from "../models/PaymentAttempt.js";
import Order from "../models/Order.js";

export const createPaymentOrder = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { addressId, checkoutAttemptId } = req.body;
    const couponCode = req.session.appliedCoupon?.code || null;

    const result = await paymentService.createRazorpayOrder(
      userId,
      addressId,
      couponCode,
      checkoutAttemptId
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("Create Payment Order Controller Error:", error);
    next(error);
  }
};

export const verifyPayment = async (req, res, next) => {
  try {
    const user = req.session.user;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      checkoutAttemptId
    } = req.body;

    // 1. HMAC Signature Verification
    const isValid = paymentService.verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed: Invalid payment signature."
      });
    }

    // 2. Authoritative Fulfillment Call
    const result = await paymentService.finalizeSuccessfulPayment({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      user
    });

    if (result.success) {
      // Clear applied coupon from session on success
      delete req.session.appliedCoupon;
      return res.json({
        success: true,
        message: "Payment verified and order placed successfully.",
        orderNumber: result.orderNumber,
        orderId: result.orderId,
        isDuplicate: result.isDuplicate || false
      });
    }

    if (result.status === "FULFILLMENT_BLOCKED") {
      return res.status(409).json({
        success: false,
        status: "FULFILLMENT_BLOCKED",
        message: result.message,
        reconciliationRequired: true
      });
    }

    return res.status(400).json({
      success: false,
      message: result.message || "Payment verification failed."
    });
  } catch (error) {
    console.error("Verify Payment Controller Error:", error);
    next(error);
  }
};

export const recordFailure = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { razorpay_order_id, failureReason } = req.body;

    if (razorpay_order_id) {
      const paymentAttempt = await PaymentAttempt.findOne({
        razorpayOrderId: razorpay_order_id,
        user: userId
      });

      if (
        paymentAttempt &&
        paymentAttempt.status !== "COMPLETED" &&
        paymentAttempt.status !== "FULFILLMENT_BLOCKED"
      ) {
        paymentAttempt.status = "FAILED";
        paymentAttempt.failureReason = failureReason || "Payment cancelled or failed";
        await paymentAttempt.save();
      }
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Record Failure Controller Error:", error);
    next(error);
  }
};

export const loadPaymentFailure = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { orderId, attemptId } = req.query;

    let paymentAttempt = null;
    if (orderId) {
      paymentAttempt = await PaymentAttempt.findOne({ razorpayOrderId: orderId, user: userId });
    } else if (attemptId) {
      paymentAttempt = await PaymentAttempt.findOne({ checkoutAttemptId: attemptId, user: userId }).sort({ createdAt: -1 });
    }

    // State-aware check: If payment actually succeeded, redirect to success page!
    if (paymentAttempt && paymentAttempt.status === "COMPLETED" && paymentAttempt.order) {
      const order = await Order.findById(paymentAttempt.order);
      if (order) {
        return res.redirect(`/checkout/success?orderNumber=${order.orderNumber}`);
      }
    }

    const isFulfillmentBlocked = paymentAttempt?.status === "FULFILLMENT_BLOCKED";
    const failureReason = paymentAttempt?.reconciliationReason || paymentAttempt?.failureReason || "Payment was cancelled or could not be processed.";
    const capturedAmount = paymentAttempt?.capturedAmount || 0;

    res.render("user/payment-failure", {
      layout: "layouts/user-layout",
      title: isFulfillmentBlocked ? "Order Fulfillment Alert" : "Payment Failed",
      isFulfillmentBlocked,
      failureReason,
      capturedAmount,
      razorpayOrderId: paymentAttempt?.razorpayOrderId || orderId || "",
      checkoutAttemptId: paymentAttempt?.checkoutAttemptId || attemptId || ""
    });
  } catch (error) {
    console.error("Load Payment Failure Error:", error);
    next(error);
  }
};

export const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const webhookHeaderId = req.headers["x-razorpay-event-id"] || null;

    if (!signature) {
      return res.status(400).json({ error: "Missing x-razorpay-signature header." });
    }

    let rawBodyBuffer = req.body;
    if (typeof rawBodyBuffer === "string") {
      rawBodyBuffer = Buffer.from(rawBodyBuffer, "utf8");
    } else if (!Buffer.isBuffer(rawBodyBuffer)) {
      rawBodyBuffer = Buffer.from(JSON.stringify(rawBodyBuffer), "utf8");
    }

    const result = await paymentService.processWebhookEvent(
      rawBodyBuffer,
      signature,
      webhookHeaderId
    );

    return res.status(200).json({ status: "ok", ...result });
  } catch (error) {
    console.error("Razorpay Webhook Error:", error.message);
    return res.status(400).json({ error: error.message });
  }
};
