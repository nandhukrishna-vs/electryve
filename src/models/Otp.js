import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },

    otp: {
      type: String,
      required: true
    },

    purpose: {
      type: String,
      enum: ["SIGNUP", "FORGOT_PASSWORD", "EMAIL_CHANGE"],
      required: true
    },

    expiresAt: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: true
  }
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ email: 1, purpose: 1 });

const Otp = mongoose.model("Otp", otpSchema);

export default Otp;