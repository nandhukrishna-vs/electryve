import Razorpay from "razorpay";
import dotenv from "dotenv";
dotenv.config();

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (!keyId || !keySecret) {
  console.warn("[RAZORPAY CONFIG WARNING] Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in environment.");
}

const razorpayClient = (keyId && keySecret)
  ? new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    })
  : null;

export const getRazorpayClient = () => {
  if (!razorpayClient) {
    throw new Error("Razorpay client is not configured. Please check your environment variables.");
  }
  return razorpayClient;
};

export const getRazorpayKeyId = () => {
  return process.env.RAZORPAY_KEY_ID || "";
};

export const getRazorpayWebhookSecret = () => {
  return process.env.RAZORPAY_WEBHOOK_SECRET || "";
};

export default razorpayClient;
