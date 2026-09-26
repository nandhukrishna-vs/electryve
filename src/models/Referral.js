import mongoose from "mongoose";

const referralSchema = new mongoose.Schema(
  {
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    referredUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    referralCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true
    },
    status: {
      type: String,
      required: true,
      enum: [
        "PENDING",
        "ORDER_QUALIFIED",
        "REWARD_PROCESSING",
        "PARTIALLY_REWARDED",
        "COMPLETED",
        "CANCELLED",
        "REWARD_REVERSED",
        "RECOVERY_REQUIRED"
      ],
      default: "PENDING",
      index: true
    },
    referredAt: {
      type: Date,
      default: Date.now
    },
    qualifyingOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true
    },
    qualifyingOrderAmount: {
      type: Number,
      default: 0
    },
    minimumOrderAmountSnapshot: {
      type: Number,
      required: true,
      default: 1000
    },
    referrerRewardAmountSnapshot: {
      type: Number,
      required: true,
      default: 200
    },
    referredUserRewardAmountSnapshot: {
      type: Number,
      required: true,
      default: 200
    },
    referrerRewardTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
      default: null
    },
    referredUserRewardTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
      default: null
    },
    rewardedAt: {
      type: Date,
      default: null
    },
    reversedAt: {
      type: Date,
      default: null
    },
    reversalReason: {
      type: String,
      default: ""
    },
    recoveryReason: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

referralSchema.index({ referrer: 1, createdAt: -1 });
referralSchema.index({ status: 1, createdAt: -1 });

const Referral =
  mongoose.models.Referral || mongoose.model("Referral", referralSchema);

export default Referral;
