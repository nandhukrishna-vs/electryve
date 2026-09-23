import Joi from "joi";
import mongoose from "mongoose";

const objectIdValidator = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error("any.invalid");
  }
  return value;
};

const offerJoiSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(3)
    .max(100)
    .required()
    .messages({
      "string.empty": "Offer name is required.",
      "string.min": "Offer name must be at least 3 characters.",
      "string.max": "Offer name cannot exceed 100 characters.",
      "any.required": "Offer name is required."
    }),

  description: Joi.string()
    .trim()
    .max(500)
    .allow("", null)
    .default("")
    .messages({
      "string.max": "Description cannot exceed 500 characters."
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

  scope: Joi.string()
    .valid("PRODUCT", "CATEGORY", "REFERRAL")
    .required()
    .messages({
      "any.only": "Scope must be PRODUCT, CATEGORY, or REFERRAL.",
      "string.empty": "Offer scope is required.",
      "any.required": "Offer scope is required."
    }),

  products: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string().custom(objectIdValidator)),
      Joi.string().custom(objectIdValidator)
    )
    .allow(null, "")
    .messages({
      "any.invalid": "One or more selected products have invalid ID format."
    }),

  categories: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string().custom(objectIdValidator)),
      Joi.string().custom(objectIdValidator)
    )
    .allow(null, "")
    .messages({
      "any.invalid": "One or more selected categories have invalid ID format."
    }),

  referralCode: Joi.string()
    .trim()
    .uppercase()
    .allow("", null)
    .default(null),

  startAt: Joi.date()
    .iso()
    .required()
    .messages({
      "date.base": "Start date/time must be a valid date.",
      "any.required": "Start date/time is required."
    }),

  expiryAt: Joi.date()
    .iso()
    .greater(Joi.ref("startAt"))
    .required()
    .messages({
      "date.base": "Expiry date/time must be a valid date.",
      "date.greater": "Expiry date/time must be later than start date/time.",
      "any.required": "Expiry date/time is required."
    }),

  priority: Joi.number()
    .integer()
    .min(0)
    .default(0)
    .allow("", null)
    .messages({
      "number.base": "Priority must be a valid integer.",
      "number.min": "Priority cannot be negative."
    }),

  maxDiscountAmount: Joi.number()
    .min(0)
    .allow("", null)
    .default(null)
    .messages({
      "number.base": "Maximum discount amount must be a valid number.",
      "number.min": "Maximum discount amount cannot be negative."
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

  isActive: Joi.alternatives()
    .try(
      Joi.boolean(),
      Joi.string().valid("true", "false", "on", "off")
    )
    .default(true)
});

/**
 * Validate offer payload and enforce scope-specific constraints
 */
export const validateOffer = (data) => {
  const normalizedData = { ...data };

  // Parse checkboxes and string booleans
  if (normalizedData.isActive === "on" || normalizedData.isActive === "true") {
    normalizedData.isActive = true;
  } else if (normalizedData.isActive === "off" || normalizedData.isActive === "false") {
    normalizedData.isActive = false;
  }

  // Ensure products and categories are arrays if provided
  if (typeof normalizedData.products === "string" && normalizedData.products.trim()) {
    normalizedData.products = [normalizedData.products.trim()];
  } else if (!Array.isArray(normalizedData.products)) {
    normalizedData.products = [];
  }

  if (typeof normalizedData.categories === "string" && normalizedData.categories.trim()) {
    normalizedData.categories = [normalizedData.categories.trim()];
  } else if (!Array.isArray(normalizedData.categories)) {
    normalizedData.categories = [];
  }

  const { error, value } = offerJoiSchema.validate(normalizedData, {
    abortEarly: false,
    stripUnknown: true
  });

  const errors = {};

  if (error) {
    error.details.forEach((detail) => {
      const field = detail.path[0];
      if (!errors[field]) {
        errors[field] = detail.message;
      }
    });
  }

  // Cross-field scope validations
  if (value?.scope === "PRODUCT" && (!value.products || value.products.length === 0)) {
    errors.products = "Please select at least one product for Product scope.";
  }

  if (value?.scope === "CATEGORY" && (!value.categories || value.categories.length === 0)) {
    errors.categories = "Please select at least one category for Category scope.";
  }

  if (value?.scope === "REFERRAL" && !value.referralCode) {
    // If specific referral code is omitted, it applies generally to referral holders, which is valid.
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      errors,
      value: null
    };
  }

  return {
    success: true,
    errors: {},
    value
  };
};
