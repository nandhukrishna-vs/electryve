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

router.route("/signup")
  .get(loadSignup)
  .post(validateSignup, signup);

router.get("/verify-otp", loadOtpPage);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);

router.route("/login")
  .get(loadLogin)
  .post(validateLogin, login);
router.get("/logout", logout);

router.route("/forgot-password")
  .get(loadForgotPassword)
  .post(validateForgotPassword, forgotPassword);

router.route("/reset-password")
  .get(loadResetPassword)
  .post(validateResetPassword, resetPassword);

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