import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true
    },
    type: {
      type: String,
      required: true,
      enum: ["CREDIT", "DEBIT"]
    },
    source: {
      type: String,
      required: true,
      enum: ["REFUND", "ORDER_PAYMENT", "ORDER_REVERSAL"]
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, "Transaction amount must be greater than zero"]
    },
    balanceBefore: {
      type: Number,
      required: true,
      min: [0, "Balance before cannot be negative"]
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: [0, "Balance after cannot be negative"]
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true
    },
    orderItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    returnRequestId: {
      type: String,
      default: null
    },
    referenceId: {
      type: String,
      default: null
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true
    },
    status: {
      type: String,
      required: true,
      enum: ["PROCESSING", "COMPLETED", "FAILED", "REVERSED"],
      default: "COMPLETED"
    }
  },
  {
    timestamps: true
  }
);

walletTransactionSchema.index({ userId: 1, createdAt: -1 });

const WalletTransaction =
  mongoose.models.WalletTransaction ||
  mongoose.model("WalletTransaction", walletTransactionSchema);

export default WalletTransaction;
