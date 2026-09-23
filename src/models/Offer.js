import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100
    },
    description: {
      type: String,
      trim: true,
      default: ""
    },
    discountType: {
      type: String,
      required: true,
      enum: ["PERCENTAGE", "FIXED"]
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0.01
    },
    scope: {
      type: String,
      required: true,
      enum: ["PRODUCT", "CATEGORY", "REFERRAL"]
    },
    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
      }
    ],
    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category"
      }
    ],
    referralCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: null
    },
    startAt: {
      type: Date,
      required: true
    },
    expiryAt: {
      type: Date,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    priority: {
      type: Number,
      default: 0,
      min: 0
    },
    maxDiscountAmount: {
      type: Number,
      default: null,
      min: 0
    },
    usageLimit: {
      type: Number,
      default: null,
      min: 1
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0
    },
    perUserLimit: {
      type: Number,
      default: null,
      min: 1
    },
    isDeleted: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for real-time display status
offerSchema.virtual("displayStatus").get(function () {
  if (this.isDeleted) return "Deleted";
  if (!this.isActive) return "Inactive";
  const now = new Date();
  if (now < this.startAt) return "Scheduled";
  if (now > this.expiryAt) return "Expired";
  if (this.usageLimit && this.usedCount >= this.usageLimit) return "Exhausted";
  return "Active";
});

// Normalized uppercase status code for server logic
offerSchema.virtual("statusCode").get(function () {
  if (this.isDeleted) return "DELETED";
  if (!this.isActive) return "INACTIVE";
  const now = new Date();
  if (now < this.startAt) return "SCHEDULED";
  if (now > this.expiryAt) return "EXPIRED";
  if (this.usageLimit && this.usedCount >= this.usageLimit) return "EXHAUSTED";
  return "ACTIVE";
});

// Index for efficient active offers lookups
offerSchema.index({ isDeleted: 1, isActive: 1, startAt: 1, expiryAt: 1 });
offerSchema.index({ scope: 1, isDeleted: 1, isActive: 1 });
offerSchema.index({ products: 1 });
offerSchema.index({ categories: 1 });
offerSchema.index({ referralCode: 1 });
offerSchema.index({ isDeleted: 1, createdAt: -1 });

const Offer = mongoose.models.Offer || mongoose.model("Offer", offerSchema);

export default Offer;
