import express from "express";
import passport from "passport";

import {
  loadSignup,
  loadLogin,
  loadOtpPage,
  signup,
  verifyOtp,
  resendOtp,
  login,
  logout,
  loadForgotPassword,
  forgotPassword,
  loadResetPassword,
  resetPassword,
  googleAuthCallback
} from "../controllers/authController.js";

import {
  validateSignup,
  validateLogin,
  validateForgotPassword,
  validateResetPassword
} from "../validators/authValidator.js";

const router = express.Router();

router.get("/signup", loadSignup);
router.post(
  "/signup",
  validateSignup,
  signup
);

router.get("/verify-otp", loadOtpPage);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);

router.get("/login", loadLogin);
router.post(
  "/login",
  validateLogin,
  login
);
router.get("/logout", logout);

router.get("/forgot-password", loadForgotPassword);
router.post(
  "/forgot-password",
  validateForgotPassword,
  forgotPassword
);

router.get("/reset-password", loadResetPassword);
router.post(
  "/reset-password",
  validateResetPassword,
  resetPassword
);

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"]
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login"
  }),
  googleAuthCallback
);

export default router;