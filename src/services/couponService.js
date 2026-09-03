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

