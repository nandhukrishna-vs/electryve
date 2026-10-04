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

router.route("/failure")
  .post(isLoggedIn, paymentController.recordFailure)
  .get(isLoggedIn, paymentController.loadPaymentFailure);

export default router;
