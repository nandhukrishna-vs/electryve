import mongoose from "mongoose";
import Coupon from "../models/Coupon.js";
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
