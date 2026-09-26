import Referral from "../models/Referral.js";
import ReferralProgram from "../models/ReferralProgram.js";
import WalletTransaction from "../models/WalletTransaction.js";
import * as referralService from "../services/referralService.js";

/**
 * Loads admin referrals dashboard list with stats cards, search, status filter, and pagination.
 */
export const loadAdminReferrals = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
    const search = req.query.search?.trim() || "";
    const status = req.query.status?.trim() || "";

    const [referralsData, adminStats, program] = await Promise.all([
      referralService.getAdminReferrals({ page, limit, search, status }),
      referralService.getAdminReferralStats(),
      ReferralProgram.getProgram()
    ]);

    const pagination = referralsData?.pagination || {};
    const currentPage = referralsData?.currentPage || pagination.page || page;
    const totalPages = referralsData?.totalPages || pagination.totalPages || 1;
    const totalCount = referralsData?.totalCount ?? pagination.totalCount ?? 0;
    const referrals = referralsData?.referrals || [];

    const successMessage = req.session.successMessage || null;
    const errorMessage = req.session.errorMessage || null;
    delete req.session.successMessage;
    delete req.session.errorMessage;

    res.render("admin/referrals/index", {
      layout: "layouts/admin-layout",
      title: "Referral Management",
      referrals,
      currentPage,
      totalPages,
      totalCount,
      limit,
      pagination,
      adminStats,
      program,
      search,
      status,
      successMessage,
      errorMessage
    });
  } catch (error) {
    console.error("[Admin Referral Controller] Error loading referrals list:", error);
    next(error);
  }
};

/**
 * Loads detailed view of a single referral relationship, qualifying order, and transaction IDs.
 */
export const loadAdminReferralDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const referral = await Referral.findById(id)
      .populate("referrer", "fullName email phone referralCode isBlocked createdAt")
      .populate("referredUser", "fullName email phone referralCode isBlocked createdAt")
      .populate({
        path: "qualifyingOrder",
        select: "orderNumber orderStatus paymentMethod paymentStatus finalAmount subtotal couponDiscount refundAmount createdAt items"
      });

    if (!referral) {
      req.session.errorMessage = "Referral record not found.";
      return res.redirect("/admin/referrals");
    }

    // Look up wallet transactions if IDs are linked
    let referrerTx = null;
    let referredTx = null;

    if (referral.referrerRewardTransactionId) {
      referrerTx = await WalletTransaction.findById(referral.referrerRewardTransactionId);
    }
    if (referral.referredRewardTransactionId) {
      referredTx = await WalletTransaction.findById(referral.referredRewardTransactionId);
    }

    res.render("admin/referrals/details", {
      layout: "layouts/admin-layout",
      title: `Referral Details #${referral._id.toString().slice(-6)}`,
      referral,
      referrerTx,
      referredTx
    });
  } catch (error) {
    console.error("[Admin Referral Controller] Error loading referral details:", error);
    next(error);
  }
};

/**
 * Loads referral program configuration view.
 */
export const loadReferralProgram = async (req, res, next) => {
  try {
    const program = await ReferralProgram.getProgram();

    const successMessage = req.session.successMessage || null;
    const errorMessage = req.session.errorMessage || null;
    delete req.session.successMessage;
    delete req.session.errorMessage;

    res.render("admin/referrals/program", {
      layout: "layouts/admin-layout",
      title: "Referral Program Settings",
      program,
      successMessage,
      errorMessage
    });
  } catch (error) {
    console.error("[Admin Referral Controller] Error loading program settings:", error);
    next(error);
  }
};

/**
 * Updates referral program configuration.
 */
export const updateReferralProgram = async (req, res, next) => {
  try {
    const {
      isActive,
      referrerRewardAmount,
      referredUserRewardAmount,
      minimumOrderAmount,
      rewardTrigger,
      maxSuccessfulReferralsPerUser
    } = req.body;

    const updates = {};
    if (typeof isActive !== "undefined") {
      updates.isActive = isActive === true || isActive === "true" || isActive === "on";
    }

    const refReward = Number(referrerRewardAmount);
    if (!isNaN(refReward) && refReward >= 0) {
      updates.referrerRewardAmount = Math.round(refReward * 100) / 100;
    }

    const referredReward = Number(referredUserRewardAmount);
    if (!isNaN(referredReward) && referredReward >= 0) {
      updates.referredUserRewardAmount = Math.round(referredReward * 100) / 100;
    }

    const minOrder = Number(minimumOrderAmount);
    if (!isNaN(minOrder) && minOrder >= 0) {
      updates.minimumOrderAmount = Math.round(minOrder * 100) / 100;
    }

    if (rewardTrigger) {
      updates.rewardTrigger = rewardTrigger;
    }

    const maxReferrals = parseInt(maxSuccessfulReferralsPerUser, 10);
    if (!isNaN(maxReferrals) && maxReferrals >= 0) {
      updates.maxSuccessfulReferralsPerUser = maxReferrals;
    }

    const updatedProgram = await ReferralProgram.updateProgram(updates);

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({
        success: true,
        message: "Referral program settings updated successfully.",
        program: updatedProgram
      });
    }

    req.session.successMessage = "Referral program settings updated successfully.";
    return res.redirect("/admin/referrals/program");
  } catch (error) {
    console.error("[Admin Referral Controller] Error updating program:", error);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({ success: false, message: error.message || "Failed to update settings." });
    }
    req.session.errorMessage = error.message || "Failed to update program settings.";
    return res.redirect("/admin/referrals/program");
  }
};

/**
 * Retries reward processing for an eligible/stuck referral.
 */
export const retryReferralReward = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await referralService.processReferralRewards(id);

    return res.json(result);
  } catch (error) {
    console.error("[Admin Referral Controller] Error retrying reward:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while retrying referral reward."
    });
  }
};

export default {
  loadAdminReferrals,
  loadAdminReferralDetails,
  loadReferralProgram,
  updateReferralProgram,
  retryReferralReward
};
