import Joi from "joi";

const couponJoiSchema = Joi.object({
  code: Joi.string()
    .trim()
    .uppercase()
    .min(3)
    .max(30)
    .pattern(/^[A-Z0-9_-]+$/)
    .required()
    .messages({
      "string.empty": "Coupon code is required.",
      "string.min": "Coupon code must be at least 3 characters.",
      "string.max": "Coupon code cannot exceed 30 characters.",
      "string.pattern.base": "Coupon code can only contain letters, numbers, hyphens, and underscores.",
      "any.required": "Coupon code is required."
    }),

  discountType: Joi.string()
    .valid("PERCENTAGE", "FIXED")
    .required()
    .messages({
      "any.only": "Discount type must be either PERCENTAGE or FIXED.",
      "string.empty": "Discount type is required.",
      "any.required": "Discount type is required."
    }),

  discountValue: Joi.number()
    .positive()
    .required()
    .when("discountType", {
      is: "PERCENTAGE",
      then: Joi.number().max(100).messages({
        "number.max": "Percentage discount cannot exceed 100%."
      })
    })
    .messages({
      "number.base": "Discount value must be a valid number.",
      "number.positive": "Discount value must be greater than 0.",
      "any.required": "Discount value is required."
    }),

  minPurchaseAmount: Joi.number()
    .min(0)
    .allow("", null)
    .default(0)
    .messages({
      "number.base": "Minimum purchase amount must be a valid number.",
      "number.min": "Minimum purchase amount cannot be negative."
    }),

  maxDiscountAmount: Joi.number()
    .min(0)
    .allow("", null)
    .default(null)
    .messages({
      "number.base": "Maximum discount amount must be a valid number.",
      "number.min": "Maximum discount amount cannot be negative."
    }),

  startDate: Joi.date()
    .iso()
    .required()
    .messages({
      "date.base": "Start date must be a valid date.",
      "any.required": "Start date is required."
    }),

  expiryDate: Joi.date()
    .iso()
    .greater(Joi.ref("startDate"))
    .required()
    .messages({
      "date.base": "Expiry date must be a valid date.",
      "date.greater": "Expiry date must be later than the start date.",
      "any.required": "Expiry date is required."
    }),

  usageLimit: Joi.number()
    .integer()
    .min(1)
    .allow("", null)
    .default(null)
    .messages({
      "number.base": "Total usage limit must be a valid integer.",
      "number.integer": "Total usage limit must be an integer.",
      "number.min": "Total usage limit must be at least 1."
    }),

  perUserLimit: Joi.number()
    .integer()
    .min(1)
    .allow("", null)
    .default(null)
    .messages({
      "number.base": "Per-user limit must be a valid integer.",
      "number.integer": "Per-user limit must be an integer.",
      "number.min": "Per-user limit must be at least 1."
    }),

  isActive: Joi.boolean()
    .truthy("true", "1", "on", 1)
    .falsy("false", "0", 0, "")
    .default(true)
}).custom((value, helpers) => {
  // If discountType is FIXED, clear maxDiscountAmount as it's not applicable
  if (value.discountType === "FIXED") {
    value.maxDiscountAmount = null;
  }
  return value;
});

/**
 * Validates raw coupon input data against Joi schema.
 * Formats errors into a field-keyed object { [field]: errorMessage } for easy EJS rendering.
 *
 * @param {Object} data - Raw request body
 * @returns {Object} { success, errors, value }
 */
export const validateCoupon = (data = {}) => {
  const sanitized = { ...data };

  // Normalize code to uppercase before Joi validation
  if (typeof sanitized.code === "string") {
    sanitized.code = sanitized.code.trim().toUpperCase();
  }

  // Convert empty string numbers to null/defaults
  ["minPurchaseAmount", "maxDiscountAmount", "usageLimit", "perUserLimit"].forEach((field) => {
    if (sanitized[field] === "" || sanitized[field] === undefined) {
      sanitized[field] = null;
    }
  });

  const { error, value } = couponJoiSchema.validate(sanitized, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = {};
    error.details.forEach((detail) => {
      const field = detail.path[0];
      if (!errors[field]) {
        errors[field] = detail.message;
      }
    });
    return {
      success: false,
      errors,
      value: sanitized
    };
  }

  return {
    success: true,
    errors: {},
    value
  };
};
