import express from "express";
import * as paymentController from "../controllers/paymentController.js";
import {
  validateCreatePaymentOrder,
  validateVerifyPayment
} from "../validators/paymentValidator.js";
import { isLoggedIn } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Public webhook route (NO session, NO user authentication)
router.post("/webhook/razorpay", paymentController.handleWebhook);

// Protected user payment routes
router.post(
  "/create-order",
  isLoggedIn,
  validateCreatePaymentOrder,
  paymentController.createPaymentOrder
);

router.post(
  "/verify",
  isLoggedIn,
  validateVerifyPayment,
  paymentController.verifyPayment
);

router.post(
  "/failure",
  isLoggedIn,
  paymentController.recordFailure
);

router.get(
  "/failure",
  isLoggedIn,
  paymentController.loadPaymentFailure
);

export default router;
