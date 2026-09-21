import mongoose from "mongoose";

const processedWebhookSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    eventType: {
      type: String,
      required: true
    },
    razorpayOrderId: {
      type: String,
      default: null,
      trim: true
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

processedWebhookSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 * 30 });

const ProcessedWebhook =
  mongoose.models.ProcessedWebhook ||
  mongoose.model("ProcessedWebhook", processedWebhookSchema);

export default ProcessedWebhook;
