import mongoose from "mongoose";

const paymentAttemptItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  sku: {
    type: String,
    trim: true,
    default: ""
  },
  productName: {
    type: String,
    required: true
  },
  brandName: {
    type: String,
    required: true
  },
  variantDetails: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  regularPrice: {
    type: Number,
    required: true
  },
  salePrice: {
    type: Number,
    required: true
  },
  offerDiscount: {
    type: Number,
    default: 0
  },
  itemTotal: {
    type: Number,
    required: true
  }
}, { _id: false });

const paymentAttemptAddressSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  addressLine1: { type: String, required: true },
  addressLine2: { type: String, default: "" },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pinCode: { type: Number, required: true },
  landmark: { type: String, default: "" }
}, { _id: false });

const paymentAttemptCouponSchema = new mongoose.Schema({
  couponId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Coupon"
  },
  code: {
    type: String,
    uppercase: true,
    trim: true
  },
  discountType: {
    type: String,
    enum: ["PERCENTAGE", "FIXED"]
  },
  discountValue: {
    type: Number
  },
  discountAmount: {
    type: Number,
    default: 0
  }
}, { _id: false });

const paymentAttemptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    checkoutAttemptId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    retryCount: {
      type: Number,
      default: 0
    },
    shippingAddress: {
      type: paymentAttemptAddressSchema,
      required: true
    },
    items: [paymentAttemptItemSchema],
    subtotal: {
      type: Number,
      required: true
    },
    catalogDiscount: {
      type: Number,
      default: 0
    },
    coupon: {
      type: paymentAttemptCouponSchema,
      default: null
    },
    couponDiscount: {
      type: Number,
      default: 0
    },
    shippingCharge: {
      type: Number,
      default: 0
    },
    tax: {
      type: Number,
      default: 0
    },
    amount: {
      type: Number,
      required: true
    },
    amountInPaise: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: "INR"
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      trim: true,
      sparse: true
    },
    razorpaySignature: {
      type: String,
      default: null,
      trim: true
    },
    status: {
      type: String,
      required: true,
      enum: ["CREATED", "PROCESSING", "COMPLETED", "FAILED", "FULFILLMENT_BLOCKED"],
      default: "CREATED",
      index: true
    },
    processingStartedAt: {
      type: Date,
      default: null
    },
    failureReason: {
      type: String,
      default: ""
    },
    reconciliationStatus: {
      type: String,
      enum: ["NONE", "REQUIRES_REFUND", "MANUAL_REVIEW"],
      default: "NONE"
    },
    reconciliationReason: {
      type: String,
      default: ""
    },
    capturedAmount: {
      type: Number,
      default: 0
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null
    },
    paymentVerifiedAt: {
      type: Date,
      default: null
    },
    processedWebhooks: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true
  }
);

paymentAttemptSchema.index({ user: 1, checkoutAttemptId: 1, status: 1 });
paymentAttemptSchema.index({ createdAt: -1 });

const PaymentAttempt = mongoose.models.PaymentAttempt || mongoose.model("PaymentAttempt", paymentAttemptSchema);
export default PaymentAttempt;
