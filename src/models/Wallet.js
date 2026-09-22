import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Wallet balance cannot be negative"]
    }
  },
  {
    timestamps: true
  }
);

const Wallet = mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);
export default Wallet;
