import Joi from "joi";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const createOrderSchema = Joi.object({
  addressId: Joi.string()
    .pattern(objectIdPattern)
    .required()
    .messages({
      "string.pattern.base": "Invalid address identifier.",
      "string.empty": "Delivery address is required.",
      "any.required": "Delivery address is required."
    }),
  checkoutAttemptId: Joi.string()
    .trim()
    .min(5)
    .max(128)
    .required()
    .messages({
      "string.empty": "Checkout attempt identifier is required.",
      "any.required": "Checkout attempt identifier is required."
    })
});

const verifyPaymentSchema = Joi.object({
  razorpay_order_id: Joi.string()
    .trim()
    .pattern(/^order_[A-Za-z0-9]+$/)
    .required()
    .messages({
      "string.pattern.base": "Invalid Razorpay Order ID format.",
      "string.empty": "Razorpay Order ID is required.",
      "any.required": "Razorpay Order ID is required."
    }),
  razorpay_payment_id: Joi.string()
    .trim()
    .pattern(/^pay_[A-Za-z0-9]+$/)
    .required()
    .messages({
      "string.pattern.base": "Invalid Razorpay Payment ID format.",
      "string.empty": "Razorpay Payment ID is required.",
      "any.required": "Razorpay Payment ID is required."
    }),
  razorpay_signature: Joi.string()
    .trim()
    .pattern(/^[a-f0-9]{64}$/i)
    .required()
    .messages({
      "string.pattern.base": "Invalid Razorpay signature format.",
      "string.empty": "Payment signature is required.",
      "any.required": "Payment signature is required."
    }),
  checkoutAttemptId: Joi.string()
    .trim()
    .allow("", null)
    .optional()
});

export const validateCreatePaymentOrder = (req, res, next) => {
  const { error } = createOrderSchema.validate(req.body, { stripUnknown: true });
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};

export const validateVerifyPayment = (req, res, next) => {
  const { error } = verifyPaymentSchema.validate(req.body, { stripUnknown: true });
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};
