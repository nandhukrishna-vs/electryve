import User from "../models/User.js";
import ReferralProgram from "../models/ReferralProgram.js";
import * as referralService from "../services/referralService.js";

/**
 * Loads the User "Refer & Earn" page with their unique code, share link,
 * program rules, stats, and referral history.
 */
export const loadReferAndEarn = async (req, res, next) => {
  try {
    const userId = req.session?.user?.id || req.session?.user?._id || req.user?._id;
    if (!userId) {
      return res.redirect("/auth/login");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect("/auth/login");
    }

    // Ensure user has a referral code
    if (!user.referralCode) {
      user.referralCode = await referralService.generateUniqueReferralCode();
      await user.save();
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 10;

    const [stats, history, program] = await Promise.all([
      referralService.getReferralStats(userId),
      referralService.getReferralHistory(userId, { page, limit }),
      ReferralProgram.getProgram()
    ]);

    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost:3000";
    const referralLink = `${protocol}://${host}/signup?ref=${user.referralCode}`;

    res.render("user/refer-and-earn", {
      layout: "layouts/user-layout",
      title: "Refer & Earn",
      user,
      referralCode: user.referralCode,
      referralLink,
      stats,
      program,
      referrals: history.referrals,
      totalPages: history.totalPages,
      currentPage: history.currentPage,
      totalCount: history.totalCount
    });
  } catch (error) {
    console.error("[Referral Controller] Error loading Refer & Earn page:", error);
    next(error);
  }
};

/**
 * AJAX endpoint to validate a referral code (e.g., during signup or checkout preview)
 */
export const validateReferralCodeAjax = async (req, res) => {
  try {
    const { code } = req.body;
    const currentUserId = req.session?.user?.id || req.session?.user?._id || req.user?._id || null;

    const result = await referralService.validateReferralCode(code, currentUserId);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("[Referral Controller] Error validating code:", error);
    return res.status(500).json({ success: false, message: "Server error validating referral code." });
  }
};

export default {
  loadReferAndEarn,
  validateReferralCodeAjax
};
