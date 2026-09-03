import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 30
    },
    discountType: {
      type: String,
      required: true,
      enum: ["PERCENTAGE", "FIXED"]
    },
    discountValue: {
      type: Number,
      required: true,
      min: 1
    },
    minPurchaseAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    maxDiscountAmount: {
      type: Number,
      default: null,
      min: 0
    },
    startDate: {
      type: Date,
      required: true
    },
    expiryDate: {
      type: Date,
      required: true
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
    isActive: {
      type: Boolean,
      default: true
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

// Virtual for real-time display status without mutating DB state
couponSchema.virtual("displayStatus").get(function () {
  if (this.isDeleted) return "Deleted";
  if (!this.isActive) return "Inactive";
  const now = new Date();
  if (now < this.startDate) return "Scheduled";
  if (now > this.expiryDate) return "Expired";
  if (this.usageLimit && this.usedCount >= this.usageLimit) return "Exhausted";
  return "Active";
});

// Partial unique index: ensures active/non-deleted coupon codes are unique while permitting soft-deleted duplicates
couponSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

// Index for efficient active list queries and sorting
couponSchema.index({ isDeleted: 1, createdAt: -1 });

const Coupon = mongoose.models.Coupon || mongoose.model("Coupon", couponSchema);

export default Coupon;
