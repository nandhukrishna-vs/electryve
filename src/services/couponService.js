import mongoose from "mongoose";
import Coupon from "../models/Coupon.js";
import Order from "../models/Order.js";
import { validateCoupon } from "../validators/couponValidator.js";

/**
 * Fetch paginated list of active/non-deleted coupons with search support
 */
export const getCoupons = async ({ page = 1, limit = 10, search = "" } = {}) => {
  const filter = { isDeleted: false };

  if (search && search.trim()) {
    filter.code = {
      $regex: search.trim(),
      $options: "i"
    };
  }

  const parsedLimit = Math.max(1, parseInt(limit, 10) || 10);
  const totalCoupons = await Coupon.countDocuments(filter);
  const totalPages = Math.ceil(totalCoupons / parsedLimit) || 1;
  const currentPage = Math.max(1, Math.min(parseInt(page, 10) || 1, totalPages));
  const skip = (currentPage - 1) * parsedLimit;

  const coupons = await Coupon.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parsedLimit);

  return {
    coupons,
    totalCoupons,
    totalPages,
    currentPage,
    limit: parsedLimit,
    search: search.trim()
  };
};

/**
 * Get single active coupon by its ID
 */
export const getCouponById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }
  return await Coupon.findOne({ _id: id, isDeleted: false });
};

/**
 * Create a new coupon
 */
export const createCoupon = async (data) => {
  const validation = validateCoupon(data);

  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors,
      message: "Validation failed. Please check the form fields."
    };
  }

  const { code } = validation.value;

  // Check for duplicate active code
  const existingCoupon = await Coupon.findOne({ code, isDeleted: false });
  if (existingCoupon) {
    return {
      success: false,
      errors: { code: `A coupon with code "${code}" already exists.` },
      message: "Coupon code already exists."
    };
  }

  try {
    const coupon = new Coupon(validation.value);
    await coupon.save();

    return {
      success: true,
      message: "Coupon created successfully.",
      coupon
    };
  } catch (error) {
    if (error.code === 11000) {
      return {
        success: false,
        errors: { code: `Coupon code "${code}" is already in use.` },
        message: "Duplicate coupon code."
      };
    }
    console.error("Create Coupon Service Error:", error);
    throw error;
  }
};

/**
 * Update an existing coupon while preserving usage statistics
 */
export const updateCoupon = async (id, data) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { success: false, message: "Invalid coupon ID." };
  }

  const coupon = await Coupon.findOne({ _id: id, isDeleted: false });
  if (!coupon) {
    return { success: false, message: "Coupon not found or has been deleted." };
  }

  const validation = validateCoupon(data);
  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors,
      message: "Validation failed. Please check the form fields."
    };
  }

  const { code } = validation.value;

  // Prevent duplicate code against other non-deleted coupons
  const duplicate = await Coupon.findOne({
    _id: { $ne: id },
    code,
    isDeleted: false
  });

  if (duplicate) {
    return {
      success: false,
      errors: { code: `Another coupon with code "${code}" already exists.` },
      message: "Coupon code already in use."
    };
  }

  try {
    coupon.code = validation.value.code;
    coupon.discountType = validation.value.discountType;
    coupon.discountValue = validation.value.discountValue;
    coupon.minPurchaseAmount = validation.value.minPurchaseAmount;
    coupon.maxDiscountAmount = validation.value.maxDiscountAmount;
    coupon.startDate = validation.value.startDate;
    coupon.expiryDate = validation.value.expiryDate;
    coupon.usageLimit = validation.value.usageLimit;
    coupon.perUserLimit = validation.value.perUserLimit;
    coupon.isActive = validation.value.isActive;
    // usedCount is intentionally preserved to maintain historical usage accuracy

    await coupon.save();

    return {
      success: true,
      message: "Coupon updated successfully.",
      coupon
    };
  } catch (error) {
    if (error.code === 11000) {
      return {
        success: false,
        errors: { code: `Coupon code "${code}" is already in use.` },
        message: "Duplicate coupon code."
      };
    }
    console.error("Update Coupon Service Error:", error);
    throw error;
  }
};

/**
 * Toggle coupon active status
 */
export const toggleCouponStatus = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { success: false, message: "Invalid coupon ID." };
  }

  const coupon = await Coupon.findOne({ _id: id, isDeleted: false });
  if (!coupon) {
    return { success: false, message: "Coupon not found." };
  }

  coupon.isActive = !coupon.isActive;
  await coupon.save();

  return {
    success: true,
    message: coupon.isActive ? "Coupon activated successfully." : "Coupon deactivated successfully.",
    isActive: coupon.isActive
  };
};

/**
 * Soft delete a coupon
 */
export const deleteCoupon = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { success: false, message: "Invalid coupon ID." };
  }

  const coupon = await Coupon.findOne({ _id: id, isDeleted: false });
  if (!coupon) {
    return { success: false, message: "Coupon not found or already deleted." };
  }

  coupon.isDeleted = true;
  coupon.isActive = false;
  await coupon.save();

  return {
    success: true,
    message: "Coupon deleted successfully."
  };
};

/**
 * Validate a coupon for user checkout and compute the server-side discount amount.
 *
 * @param {ObjectId|string} userId
 * @param {string} couponCode
 * @param {number} subtotal
 * @returns {Promise<Object>} { success, coupon, discountAmount, subtotal, payableAmount, message }
 */
export const validateUserCoupon = async (userId, couponCode, subtotal) => {
  if (!couponCode || !couponCode.trim()) {
    return { success: false, message: "Coupon code is required." };
  }

  if (typeof subtotal !== "number" || subtotal <= 0) {
    return { success: false, message: "Coupon cannot be applied to an empty cart." };
  }

  const normalizedCode = couponCode.trim().toUpperCase();
  const coupon = await Coupon.findOne({ code: normalizedCode, isDeleted: false });

  if (!coupon) {
    return { success: false, message: "Invalid coupon code." };
  }

  if (!coupon.isActive) {
    return { success: false, message: "Coupon is inactive." };
  }

  const now = new Date();
  if (now < new Date(coupon.startDate)) {
    return { success: false, message: "Coupon is not active yet." };
  }

  if (now > new Date(coupon.expiryDate)) {
    return { success: false, message: "Coupon has expired." };
  }

  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    return { success: false, message: "Coupon usage limit has been reached." };
  }

  if (coupon.perUserLimit) {
    // Count previous orders by this user using this coupon that are not completely cancelled
    const userUsageCount = await Order.countDocuments({
      user: userId,
      $or: [
        { "coupon.couponId": coupon._id },
        { "coupon.code": coupon.code }
      ],
      orderStatus: { $ne: "CANCELLED" }
    });

    if (userUsageCount >= coupon.perUserLimit) {
      return {
        success: false,
        message: "You have already used this coupon the maximum number of times."
      };
    }
  }

  if (coupon.minPurchaseAmount && subtotal < coupon.minPurchaseAmount) {
    return {
      success: false,
      message: `Minimum purchase of ₹${coupon.minPurchaseAmount.toLocaleString("en-IN")} is required for this coupon.`
    };
  }

  // Calculate discount based on server-verified subtotal
  let discountAmount = 0;
  if (coupon.discountType === "PERCENTAGE") {
    discountAmount = Math.round((subtotal * coupon.discountValue) / 100);
    if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
      discountAmount = coupon.maxDiscountAmount;
    }
  } else if (coupon.discountType === "FIXED") {
    discountAmount = coupon.discountValue;
  }

  // Ensure discount never exceeds subtotal and is never negative
  discountAmount = Math.max(0, Math.min(discountAmount, subtotal));

  return {
    success: true,
    coupon,
    discountAmount,
    subtotal,
    payableAmount: Math.max(0, subtotal - discountAmount)
  };
};

/**
 * Retrieve eligible and ineligible coupons for an authenticated user based on live cart subtotal.
 *
 * @param {ObjectId|string} userId
 * @param {Object} options
 * @param {number} options.subtotal - Live Offer-adjusted subtotal
 * @param {string} [options.appliedCode=null] - Currently applied coupon code in session
 * @returns {Promise<Object>} { eligibleCoupons, ineligibleCoupons, subtotal }
 */
export const getEligibleCouponsForUser = async (userId, { subtotal = 0, appliedCode = null } = {}) => {
  const numericSubtotal = Math.max(0, Number(subtotal) || 0);
  const now = new Date();

  // 1. Fetch non-deleted coupons
  const allCoupons = await Coupon.find({ isDeleted: false })
    .sort({ createdAt: -1 })
    .lean();

  // 2. Fetch user's historical order coupon usage in a single batch query
  const userUsageMap = {};
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    const userCouponOrders = await Order.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          orderStatus: { $ne: "CANCELLED" },
          "coupon.code": { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: "$coupon.code",
          count: { $sum: 1 }
        }
      }
    ]);

    userCouponOrders.forEach((o) => {
      if (o._id) {
        userUsageMap[o._id.toUpperCase()] = o.count;
      }
    });
  }

  const eligibleCoupons = [];
  const ineligibleCoupons = [];

  for (const coupon of allCoupons) {
    const code = coupon.code;
    const isApplied = Boolean(
      appliedCode && appliedCode.trim().toUpperCase() === code.toUpperCase()
    );

    // Filter out inactive
    if (!coupon.isActive) {
      ineligibleCoupons.push({
        _id: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchaseAmount: coupon.minPurchaseAmount || 0,
        maxDiscountAmount: coupon.maxDiscountAmount || null,
        startDate: coupon.startDate,
        expiryDate: coupon.expiryDate,
        isApplied,
        isEligible: false,
        ineligibleReason: "Coupon is not currently active."
      });
      continue;
    }

    // Check future/scheduled coupon
    if (now < new Date(coupon.startDate)) {
      ineligibleCoupons.push({
        _id: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchaseAmount: coupon.minPurchaseAmount || 0,
        maxDiscountAmount: coupon.maxDiscountAmount || null,
        startDate: coupon.startDate,
        expiryDate: coupon.expiryDate,
        isApplied,
        isEligible: false,
        ineligibleReason: `Starts on ${new Date(coupon.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`
      });
      continue;
    }

    // Check expired coupon
    if (now > new Date(coupon.expiryDate)) {
      ineligibleCoupons.push({
        _id: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchaseAmount: coupon.minPurchaseAmount || 0,
        maxDiscountAmount: coupon.maxDiscountAmount || null,
        startDate: coupon.startDate,
        expiryDate: coupon.expiryDate,
        isApplied,
        isEligible: false,
        ineligibleReason: "Coupon has expired."
      });
      continue;
    }

    // Check global usage limit
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      ineligibleCoupons.push({
        _id: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchaseAmount: coupon.minPurchaseAmount || 0,
        maxDiscountAmount: coupon.maxDiscountAmount || null,
        startDate: coupon.startDate,
        expiryDate: coupon.expiryDate,
        isApplied,
        isEligible: false,
        ineligibleReason: "Coupon usage limit has been reached."
      });
      continue;
    }

    // Check per-user limit
    const userTimesUsed = userUsageMap[code.toUpperCase()] || 0;
    if (coupon.perUserLimit && userTimesUsed >= coupon.perUserLimit) {
      ineligibleCoupons.push({
        _id: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchaseAmount: coupon.minPurchaseAmount || 0,
        maxDiscountAmount: coupon.maxDiscountAmount || null,
        startDate: coupon.startDate,
        expiryDate: coupon.expiryDate,
        isApplied,
        isEligible: false,
        ineligibleReason: "You have already used this coupon the maximum number of times."
      });
      continue;
    }

    // Check minimum purchase amount
    const minPurchase = coupon.minPurchaseAmount || 0;
    if (minPurchase > 0 && numericSubtotal < minPurchase) {
      const shortfall = minPurchase - numericSubtotal;
      ineligibleCoupons.push({
        _id: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchaseAmount: minPurchase,
        maxDiscountAmount: coupon.maxDiscountAmount || null,
        startDate: coupon.startDate,
        expiryDate: coupon.expiryDate,
        isApplied,
        isEligible: false,
        shortfall,
        ineligibleReason: `Add ₹${shortfall.toLocaleString("en-IN")} more to qualify (Min. ₹${minPurchase.toLocaleString("en-IN")}).`
      });
      continue;
    }

    // If all pass, calculate projected discount
    let projectedDiscount = 0;
    if (coupon.discountType === "PERCENTAGE") {
      projectedDiscount = Math.round((numericSubtotal * coupon.discountValue) / 100);
      if (coupon.maxDiscountAmount && projectedDiscount > coupon.maxDiscountAmount) {
        projectedDiscount = coupon.maxDiscountAmount;
      }
    } else if (coupon.discountType === "FIXED") {
      projectedDiscount = coupon.discountValue;
    }
    projectedDiscount = Math.max(0, Math.min(projectedDiscount, numericSubtotal));

    eligibleCoupons.push({
      _id: coupon._id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      projectedDiscount,
      minPurchaseAmount: minPurchase,
      maxDiscountAmount: coupon.maxDiscountAmount || null,
      startDate: coupon.startDate,
      expiryDate: coupon.expiryDate,
      isApplied,
      isEligible: true
    });
  }

  // Sort eligible coupons deterministically:
  // 1. Currently applied coupon first
  // 2. Highest projected discount descending
  // 3. Expiry date soonest ascending
  // 4. _id string comparison
  eligibleCoupons.sort((a, b) => {
    if (a.isApplied && !b.isApplied) return -1;
    if (!a.isApplied && b.isApplied) return 1;
    if (b.projectedDiscount !== a.projectedDiscount) {
      return b.projectedDiscount - a.projectedDiscount;
    }
    const aExp = new Date(a.expiryDate).getTime();
    const bExp = new Date(b.expiryDate).getTime();
    if (aExp !== bExp) return aExp - bExp;
    return a._id.toString().localeCompare(b._id.toString());
  });

  return {
    eligibleCoupons,
    ineligibleCoupons,
    subtotal: numericSubtotal
  };
};

