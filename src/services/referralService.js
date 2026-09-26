import mongoose from "mongoose";
import crypto from "crypto";
import Joi from "joi";
import ReferralProgram from "../models/ReferralProgram.js";
import Referral from "../models/Referral.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import WalletTransaction from "../models/WalletTransaction.js";
import * as walletService from "./walletService.js";

const REFERRAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 32 characters (no 0, O, 1, I)
const CODE_LENGTH = 8;

/**
 * Generates an 8-character uppercase alphanumeric string avoiding ambiguous characters.
 */
export const generateReferralCodeString = () => {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += REFERRAL_ALPHABET[bytes[i] % REFERRAL_ALPHABET.length];
  }
  return code;
};

/**
 * Generates a unique referral code guaranteed not to collide in the User collection.
 */
export const generateUniqueReferralCode = async () => {
  let isUnique = false;
  let code = "";
  let attempts = 0;

  while (!isUnique && attempts < 25) {
    attempts++;
    code = generateReferralCodeString();
    const existing = await User.findOne({ referralCode: code });
    if (!existing) {
      isUnique = true;
    }
  }

  if (!isUnique) {
    throw new Error("Unable to generate a unique referral code after multiple attempts.");
  }

  return code;
};

/**
 * Ensures a user has a valid unique referralCode. Backfills if missing.
 */
export const ensureReferralCode = async (userId) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return null;
  const user = await User.findById(userId);
  if (!user) return null;

  if (user.referralCode && user.referralCode.trim()) {
    return user.referralCode.trim().toUpperCase();
  }

  let attempts = 0;
  while (attempts < 5) {
    attempts++;
    try {
      const code = await generateUniqueReferralCode();
      const updated = await User.findOneAndUpdate(
        {
          _id: userId,
          $or: [
            { referralCode: null },
            { referralCode: "" },
            { referralCode: { $exists: false } }
          ]
        },
        { $set: { referralCode: code } },
        { returnDocument: "after" }
      );

      if (updated && updated.referralCode) {
        return updated.referralCode;
      }

      // If another concurrent request already backfilled it
      const refreshed = await User.findById(userId);
      if (refreshed?.referralCode) {
        return refreshed.referralCode;
      }
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate key collision: retry with another code
        continue;
      }
      throw err;
    }
  }

  const finalCheck = await User.findById(userId);
  return finalCheck?.referralCode || null;
};

/**
 * Retrieves the singleton ReferralProgram configuration.
 */
export const getReferralProgram = async () => {
  return await ReferralProgram.getProgram();
};

/**
 * Admin update for ReferralProgram settings.
 */
export const updateReferralProgram = async (updates = {}) => {
  const schema = Joi.object({
    isActive: Joi.boolean().required(),
    referrerRewardAmount: Joi.number().min(0).required(),
    referredUserRewardAmount: Joi.number().min(0).required(),
    minimumOrderAmount: Joi.number().min(0).required(),
    rewardTrigger: Joi.string().valid("DELIVERED", "ORDER_DELIVERED").default("ORDER_DELIVERED"),
    maxSuccessfulReferralsPerUser: Joi.number().integer().min(1).allow(null).optional()
  });

  const { error, value } = schema.validate(updates, { abortEarly: false, stripUnknown: true });
  if (error) {
    const errorMessages = error.details.map((d) => d.message).join(", ");
    return { success: false, message: errorMessages };
  }

  let program = await ReferralProgram.findOne({ key: "DEFAULT_REFERRAL_PROGRAM" });
  if (!program) {
    program = await ReferralProgram.getProgram();
  }

  program.isActive = value.isActive;
  program.referrerRewardAmount = Math.round(value.referrerRewardAmount * 100) / 100;
  program.referredUserRewardAmount = Math.round(value.referredUserRewardAmount * 100) / 100;
  program.minimumOrderAmount = Math.round(value.minimumOrderAmount * 100) / 100;
  program.rewardTrigger = value.rewardTrigger || "DELIVERED";
  program.maxSuccessfulReferralsPerUser = value.maxSuccessfulReferralsPerUser ?? null;

  await program.save();
  return { success: true, message: "Referral program configuration updated successfully.", program };
};

/**
 * Validates a referral code server-side for new signup or verification.
 */
export const validateReferralCode = async (rawCode, currentUserId = null) => {
  if (!rawCode || typeof rawCode !== "string" || !rawCode.trim()) {
    return { isValid: false, success: false, message: "Referral code is required." };
  }

  const normalizedCode = rawCode.trim().toUpperCase();

  const program = await getReferralProgram();
  if (!program || !program.isActive) {
    return { isValid: false, success: false, message: "The referral program is currently disabled." };
  }

  const referrer = await User.findOne({
    referralCode: normalizedCode,
    status: { $ne: "DELETED" }
  });

  if (!referrer) {
    return { isValid: false, success: false, message: "Invalid referral code. Please check and try again." };
  }

  if (referrer.status === "BLOCKED" || referrer.isBlocked) {
    return { isValid: false, success: false, message: "Referrer account is not eligible for referral rewards." };
  }

  if (currentUserId && referrer._id.toString() === currentUserId.toString()) {
    return { isValid: false, success: false, message: "You cannot use your own referral code." };
  }

  if (program.maxSuccessfulReferralsPerUser) {
    const successfulCount = await Referral.countDocuments({
      referrer: referrer._id,
      status: "COMPLETED"
    });
    if (successfulCount >= program.maxSuccessfulReferralsPerUser) {
      return {
        isValid: false,
        success: false,
        message: "This referral code has reached its maximum allowable referral limit."
      };
    }
  }

  return {
    isValid: true,
    success: true,
    message: "Referral code verified successfully.",
    referrer,
    referrerName: referrer.fullName,
    program
  };
};

/**
 * Captures referral code into the session safely.
 */
export const captureReferralCode = (rawCode, session) => {
  if (!session || !rawCode || typeof rawCode !== "string") return null;
  const normalized = rawCode.trim().toUpperCase();
  if (normalized) {
    session.referralCode = normalized;
    return normalized;
  }
  return null;
};

/**
 * Establishes referral attribution upon new user account creation.
 * Snapshots program terms into the Referral record and sets User.referredBy.
 */
export const createReferralForUser = async (userId, rawReferralCode, session = null) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }

  // Submitted code takes precedence over session code
  const effectiveCode = (rawReferralCode && typeof rawReferralCode === "string" && rawReferralCode.trim())
    ? rawReferralCode.trim().toUpperCase()
    : (session?.referralCode ? String(session.referralCode).trim().toUpperCase() : null);

  if (!effectiveCode) {
    return null;
  }

  // 1. Verify user exists and doesn't already have a referrer
  const user = await User.findById(userId);
  if (!user) return null;

  if (user.referredBy) {
    // Relationship is immutable once set
    return null;
  }

  const existingReferral = await Referral.findOne({ referredUser: userId });
  if (existingReferral) {
    return existingReferral;
  }

  // 2. Validate referral code
  const validation = await validateReferralCode(effectiveCode, userId);
  if (!validation.isValid) {
    return null;
  }

  const referrer = validation.referrer;
  const program = validation.program;

  // 3. Create Referral with snapshotted terms
  const referral = new Referral({
    referrer: referrer._id,
    referredUser: user._id,
    referralCode: effectiveCode,
    status: "PENDING",
    referredAt: new Date(),
    minimumOrderAmountSnapshot: program.minimumOrderAmount,
    referrerRewardAmountSnapshot: program.referrerRewardAmount,
    referredUserRewardAmountSnapshot: program.referredUserRewardAmount
  });

  try {
    await referral.save();
  } catch (err) {
    if (err.code === 11000) {
      // Race condition / already exists
      return await Referral.findOne({ referredUser: userId });
    }
    throw err;
  }

  // 4. Atomically set user.referredBy (immutable)
  await User.updateOne(
    { _id: user._id, referredBy: null },
    { $set: { referredBy: referrer._id } }
  );

  // 5. Clean up referral session
  if (session && session.referralCode) {
    delete session.referralCode;
  }

  return referral;
};

/**
 * Retrieves user's referral statistics and dashboard metadata for /refer-and-earn.
 */
export const getUserReferralStats = async (userId) => {
  if (!userId) throw new Error("User ID is required.");

  const [code, program, referrals] = await Promise.all([
    ensureReferralCode(userId),
    getReferralProgram(),
    Referral.find({ referrer: userId }).lean()
  ]);

  let totalReferrals = referrals.length;
  let pendingReferrals = 0;
  let completedReferrals = 0;
  let totalEarned = 0;

  referrals.forEach((r) => {
    if (r.status === "COMPLETED") {
      completedReferrals++;
      totalEarned += (r.referrerRewardAmountSnapshot || 0);
    } else if (["PENDING", "ORDER_QUALIFIED", "REWARD_PROCESSING", "PARTIALLY_REWARDED"].includes(r.status)) {
      pendingReferrals++;
    }
  });

  totalEarned = Math.round(totalEarned * 100) / 100;

  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  const referralLink = appUrl ? `${appUrl}/signup?ref=${code}` : `/signup?ref=${code}`;

  return {
    referralCode: code,
    referralLink,
    totalReferrals,
    pendingReferrals,
    completedReferrals,
    totalEarned,
    program: {
      isActive: program.isActive,
      referrerRewardAmount: program.referrerRewardAmount,
      referredUserRewardAmount: program.referredUserRewardAmount,
      minimumOrderAmount: program.minimumOrderAmount
    }
  };
};

/**
 * Retrieves paginated referral history for the authenticated user.
 */
export const getUserReferrals = async (userId, { page = 1, limit = 10 } = {}) => {
  const curPage = Math.max(1, parseInt(page, 10) || 1);
  const pageLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (curPage - 1) * pageLimit;

  const [totalCount, referralsRaw] = await Promise.all([
    Referral.countDocuments({ referrer: userId }),
    Referral.find({ referrer: userId })
      .populate("referredUser", "fullName email avatar status createdAt")
      .populate("qualifyingOrder", "orderNumber finalAmount orderStatus")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .lean()
  ]);

  const referrals = referralsRaw.map((r) => ({
    _id: r._id,
    friendName: r.referredUser?.fullName || "User",
    friendEmail: r.referredUser?.email || "—",
    status: r.status,
    joinedDate: r.referredAt || r.createdAt,
    rewardAmount: r.referrerRewardAmountSnapshot,
    rewardedAt: r.rewardedAt,
    orderNumber: r.qualifyingOrder?.orderNumber || null
  }));

  const totalPages = Math.ceil(totalCount / pageLimit) || 1;

  return {
    referrals,
    pagination: {
      page: curPage,
      limit: pageLimit,
      totalCount,
      totalPages,
      hasNextPage: curPage < totalPages,
      hasPrevPage: curPage > 1
    }
  };
};

/**
 * Finds if an order qualifies a referral relationship upon DELIVERED transition.
 */
export const findQualifyingReferral = async (orderId) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    return { isQualifying: false, reason: "Invalid order ID." };
  }

  const order = await Order.findById(orderId).lean();
  if (!order) {
    return { isQualifying: false, reason: "Order not found." };
  }

  // 1. Order must be DELIVERED
  if (order.orderStatus !== "DELIVERED") {
    return { isQualifying: false, reason: `Order status is "${order.orderStatus}", requires "DELIVERED".` };
  }

  // 2. Order must be realized/paid
  const isPaid = (["RAZORPAY", "WALLET"].includes(order.paymentMethod) && ["COMPLETED", "PAID"].includes(order.paymentStatus)) ||
                (order.paymentMethod === "COD" && order.paymentStatus === "COMPLETED");
  if (!isPaid) {
    return { isQualifying: false, reason: "Order payment is not completed." };
  }

  // 3. Find Referral for this user
  const referral = await Referral.findOne({ referredUser: order.user });
  if (!referral) {
    return { isQualifying: false, reason: "User has no referral relationship." };
  }

  // If already rewarded or reversed
  if (["COMPLETED", "REWARD_REVERSED", "CANCELLED"].includes(referral.status)) {
    return { isQualifying: false, reason: `Referral status is already "${referral.status}".` };
  }

  // 4. Order must meet or exceed minimum order amount snapshot
  const orderAmount = Number(order.finalAmount) || 0;
  if (orderAmount < referral.minimumOrderAmountSnapshot) {
    return {
      isQualifying: false,
      reason: `Order amount (₹${orderAmount}) is below minimum required snapshot (₹${referral.minimumOrderAmountSnapshot}).`
    };
  }

  // 5. Must be the FIRST qualifying delivered order
  const earlierQualifyingOrder = await Order.findOne({
    user: order.user,
    _id: { $ne: order._id },
    orderStatus: "DELIVERED",
    createdAt: { $lt: order.createdAt },
    finalAmount: { $gte: referral.minimumOrderAmountSnapshot }
  });

  if (earlierQualifyingOrder) {
    return { isQualifying: false, reason: "An earlier qualifying order already exists for this user." };
  }

  return {
    isQualifying: true,
    referral,
    order
  };
};

/**
 * Processes wallet rewards for both referrer and referred user upon order delivery.
 * Enforces two-wallet atomicity, idempotency, and partial failure recovery.
 */
export const processReferralRewards = async (referralId) => {
  if (!referralId || !mongoose.Types.ObjectId.isValid(referralId)) {
    return { success: false, message: "Invalid referral ID." };
  }

  const referral = await Referral.findById(referralId);
  if (!referral) {
    return { success: false, message: "Referral not found." };
  }

  if (referral.status === "COMPLETED") {
    return { success: true, message: "Referral reward already completed.", status: "COMPLETED" };
  }

  const [referrer, referredUser, order] = await Promise.all([
    User.findById(referral.referrer),
    User.findById(referral.referredUser),
    referral.qualifyingOrder ? Order.findById(referral.qualifyingOrder) : null
  ]);

  if (!referrer || !referredUser) {
    return { success: false, message: "Referral participants not found." };
  }

  const orderNumStr = order ? `#${order.orderNumber}` : "";

  // 1. Credit Referrer Wallet
  if (!referral.referrerRewardTransactionId && referral.referrerRewardAmountSnapshot > 0) {
    if (referrer.status !== "DELETED") {
      const referrerKey = `REFERRAL_REWARD:${referral._id}:REFERRER`;
      const refCredit = await walletService.creditWallet({
        userId: referrer._id,
        amount: referral.referrerRewardAmountSnapshot,
        source: "REFERRAL_REWARD",
        description: `Referral reward for inviting ${referredUser.fullName}`,
        idempotencyKey: referrerKey,
        orderId: referral.qualifyingOrder,
        referenceId: referral._id.toString()
      });

      if (refCredit.success && refCredit.transaction) {
        referral.referrerRewardTransactionId = refCredit.transaction._id;
      }
    }
  }

  // 2. Credit Referred User Wallet (Cashback)
  if (!referral.referredUserRewardTransactionId && referral.referredUserRewardAmountSnapshot > 0) {
    if (referredUser.status !== "DELETED") {
      const userKey = `REFERRAL_REWARD:${referral._id}:REFERRED`;
      const userCredit = await walletService.creditWallet({
        userId: referredUser._id,
        amount: referral.referredUserRewardAmountSnapshot,
        source: "REFERRAL_REWARD",
        description: `Referral welcome cashback for order ${orderNumStr}`.trim(),
        idempotencyKey: userKey,
        orderId: referral.qualifyingOrder,
        referenceId: referral._id.toString()
      });

      if (userCredit.success && userCredit.transaction) {
        referral.referredUserRewardTransactionId = userCredit.transaction._id;
      }
    }
  }

  // 3. Status Resolution
  const referrerDone = !referral.referrerRewardAmountSnapshot || !!referral.referrerRewardTransactionId;
  const userDone = !referral.referredUserRewardAmountSnapshot || !!referral.referredUserRewardTransactionId;

  if (referrerDone && userDone) {
    referral.status = "COMPLETED";
    referral.rewardedAt = new Date();
  } else if (referral.referrerRewardTransactionId || referral.referredUserRewardTransactionId) {
    referral.status = "PARTIALLY_REWARDED";
  } else {
    referral.status = "ORDER_QUALIFIED";
  }

  await referral.save();
  return { success: true, status: referral.status, referral };
};

/**
 * Delivery event hook: triggered whenever an order becomes DELIVERED.
 */
export const handleOrderDelivered = async (orderId) => {
  try {
    const qual = await findQualifyingReferral(orderId);
    if (!qual.isQualifying) {
      return { handled: false, reason: qual.reason };
    }

    const referral = qual.referral;
    referral.qualifyingOrder = qual.order._id;
    referral.qualifyingOrderAmount = qual.order.finalAmount;
    referral.status = "ORDER_QUALIFIED";
    await referral.save();

    const result = await processReferralRewards(referral._id);
    return { handled: true, result };
  } catch (err) {
    console.error(`Error in handleOrderDelivered for order ${orderId}:`, err);
    return { handled: false, error: err.message };
  }
};

/**
 * Order cancellation/return event hook: reverses referral rewards safely if the order is no longer qualifying.
 */
export const handleOrderReturnOrCancel = async (
  orderId,
  { reason = "Order return or cancellation", isItemReturn = false, remainingOrderAmount = null } = {}
) => {
  try {
    const referral = await Referral.findOne({ qualifyingOrder: orderId });
    if (!referral) return { handled: false, reason: "No referral linked to this order." };

    // If this is a partial item return, check if remaining amount still satisfies the minimum snapshot
    if (isItemReturn && remainingOrderAmount !== null) {
      if (Number(remainingOrderAmount) >= referral.minimumOrderAmountSnapshot) {
        return {
          handled: true,
          reversed: false,
          status: referral.status,
          message: "Order still satisfies minimum qualifying threshold after partial return."
        };
      }
      reason = reason || "Order value fell below minimum threshold after partial return";
    }

    if (referral.status !== "COMPLETED" && referral.status !== "PARTIALLY_REWARDED") {
      // If it hadn't completed rewards, mark cancelled
      referral.status = "CANCELLED";
      referral.reversalReason = reason;
      await referral.save();
      return { handled: true, status: "CANCELLED" };
    }

    // If rewards were processed, perform safe reversal
    return await reverseReferralRewards(referral._id, reason);
  } catch (err) {
    console.error(`Error in handleOrderReturnOrCancel for order ${orderId}:`, err);
    return { handled: false, error: err.message };
  }
};

/**
 * Reverses referral rewards safely without allowing wallet balances to go negative.
 */
export const reverseReferralRewards = async (referralId, reason = "Qualifying order returned/cancelled") => {
  const referral = await Referral.findById(referralId);
  if (!referral) return { success: false, message: "Referral not found." };

  if (referral.status === "REWARD_REVERSED") {
    return { success: true, message: "Referral rewards already reversed." };
  }

  let recoveryRequired = false;
  let recoveryNotes = [];

  // 1. Reverse Referrer Reward
  if (referral.referrerRewardTransactionId && referral.referrerRewardAmountSnapshot > 0) {
    const refKey = `REFERRAL_REVERSAL:${referral._id}:REFERRER`;
    const existingRefRev = await WalletTransaction.findOne({ idempotencyKey: refKey });
    if (!existingRefRev) {
      const debitRes = await walletService.debitWallet({
        userId: referral.referrer,
        amount: referral.referrerRewardAmountSnapshot,
        source: "REFERRAL_REVERSAL",
        description: `Reversal of referral reward: ${reason}`,
        idempotencyKey: refKey,
        orderId: referral.qualifyingOrder,
        referenceId: referral._id.toString()
      });

      if (!debitRes.success) {
        recoveryRequired = true;
        recoveryNotes.push(`Referrer wallet insufficient balance for ₹${referral.referrerRewardAmountSnapshot} reversal.`);
      }
    }
  }

  // 2. Reverse Referred User Reward
  if (referral.referredUserRewardTransactionId && referral.referredUserRewardAmountSnapshot > 0) {
    const userKey = `REFERRAL_REVERSAL:${referral._id}:REFERRED`;
    const existingUserRev = await WalletTransaction.findOne({ idempotencyKey: userKey });
    if (!existingUserRev) {
      const debitRes = await walletService.debitWallet({
        userId: referral.referredUser,
        amount: referral.referredUserRewardAmountSnapshot,
        source: "REFERRAL_REVERSAL",
        description: `Reversal of referral cashback: ${reason}`,
        idempotencyKey: userKey,
        orderId: referral.qualifyingOrder,
        referenceId: referral._id.toString()
      });

      if (!debitRes.success) {
        recoveryRequired = true;
        recoveryNotes.push(`Referred user wallet insufficient balance for ₹${referral.referredUserRewardAmountSnapshot} reversal.`);
      }
    }
  }

  referral.reversedAt = new Date();
  referral.reversalReason = reason;

  if (recoveryRequired) {
    referral.status = "RECOVERY_REQUIRED";
    referral.recoveryReason = recoveryNotes.join(" ");
  } else {
    referral.status = "REWARD_REVERSED";
  }

  await referral.save();
  return { success: true, status: referral.status, referral };
};

/**
 * Admin action to retry reward processing for stuck or partially rewarded referrals.
 */
export const retryReferralReward = async (referralId) => {
  const referral = await Referral.findById(referralId);
  if (!referral) {
    return { success: false, message: "Referral not found." };
  }

  if (referral.status === "COMPLETED") {
    return { success: false, message: "Referral is already completed." };
  }

  if (["CANCELLED", "REWARD_REVERSED"].includes(referral.status)) {
    return { success: false, message: `Cannot retry a ${referral.status} referral.` };
  }

  return await processReferralRewards(referral._id);
};

/**
 * Admin listing with search, filtering, and server-side pagination.
 */
export const getAdminReferrals = async ({
  page = 1,
  limit = 15,
  status = "ALL",
  search = ""
} = {}) => {
  const curPage = Math.max(1, parseInt(page, 10) || 1);
  const pageLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));
  const skip = (curPage - 1) * pageLimit;

  const matchFilter = {};

  if (status && status !== "ALL") {
    matchFilter.status = status;
  }

  if (search && search.trim()) {
    const s = search.trim();
    // Search user IDs matching name or email
    const matchingUsers = await User.find({
      $or: [
        { fullName: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } }
      ]
    }).select("_id").lean();
    const userIds = matchingUsers.map((u) => u._id);

    // Search orders matching orderNumber
    const matchingOrders = await Order.find({
      orderNumber: { $regex: s, $options: "i" }
    }).select("_id").lean();
    const orderIds = matchingOrders.map((o) => o._id);

    matchFilter.$or = [
      { referralCode: { $regex: s, $options: "i" } },
      ...(userIds.length > 0 ? [{ referrer: { $in: userIds } }, { referredUser: { $in: userIds } }] : []),
      ...(orderIds.length > 0 ? [{ qualifyingOrder: { $in: orderIds } }] : [])
    ];
  }

  const [totalCount, referrals] = await Promise.all([
    Referral.countDocuments(matchFilter),
    Referral.find(matchFilter)
      .populate("referrer", "fullName email status")
      .populate("referredUser", "fullName email status createdAt")
      .populate("qualifyingOrder", "orderNumber finalAmount orderStatus")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .lean()
  ]);

  const totalPages = Math.ceil(totalCount / pageLimit) || 1;

  return {
    referrals,
    totalCount,
    totalPages,
    currentPage: curPage,
    limit: pageLimit,
    pagination: {
      page: curPage,
      limit: pageLimit,
      totalCount,
      totalPages,
      hasNextPage: curPage < totalPages,
      hasPrevPage: curPage > 1
    }
  };
};

/**
 * Admin aggregated stats summary across all referrals.
 */
export const getAdminReferralStats = async () => {
  const [counts] = await Referral.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] } },
        qualified: { $sum: { $cond: [{ $eq: ["$status", "ORDER_QUALIFIED"] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
        reversed: { $sum: { $cond: [{ $eq: ["$status", "REWARD_REVERSED"] }, 1, 0] } },
        recoveryRequired: { $sum: { $cond: [{ $eq: ["$status", "RECOVERY_REQUIRED"] }, 1, 0] } },
        totalRewardsPaid: {
          $sum: {
            $cond: [
              { $in: ["$status", ["COMPLETED", "PARTIALLY_REWARDED"]] },
              { $cond: [{ $ne: ["$referrerRewardTransactionId", null] }, "$referrerRewardAmountSnapshot", 0] },
              0
            ]
          }
        },
        totalCashbackPaid: {
          $sum: {
            $cond: [
              { $in: ["$status", ["COMPLETED", "PARTIALLY_REWARDED"]] },
              { $cond: [{ $ne: ["$referredUserRewardTransactionId", null] }, "$referredUserRewardAmountSnapshot", 0] },
              0
            ]
          }
        }
      }
    }
  ]);

  return {
    totalReferrals: counts?.total || 0,
    pendingReferrals: counts?.pending || 0,
    qualifiedReferrals: counts?.qualified || 0,
    completedReferrals: counts?.completed || 0,
    reversedReferrals: counts?.reversed || 0,
    recoveryRequired: counts?.recoveryRequired || 0,
    totalRewardsPaid: Math.round((counts?.totalRewardsPaid || 0) * 100) / 100,
    totalCashbackPaid: Math.round((counts?.totalCashbackPaid || 0) * 100) / 100
  };
};

/**
 * Retrieves full referral details by ID for admin view.
 */
export const getReferralDetails = async (id) => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;

  return await Referral.findById(id)
    .populate("referrer", "fullName email phone status referralCode createdAt")
    .populate("referredUser", "fullName email phone status createdAt")
    .populate("qualifyingOrder")
    .populate("referrerRewardTransactionId")
    .populate("referredUserRewardTransactionId")
    .lean();
};

/**
 * Attribute referral alias function
 */
export const attributeReferral = async ({ userId, referralCode, session = null }) => {
  const ref = await createReferralForUser(userId, referralCode, session);
  return {
    success: !!ref,
    referral: ref
  };
};

export const getReferralStats = getUserReferralStats;
export const getReferralHistory = getUserReferrals;