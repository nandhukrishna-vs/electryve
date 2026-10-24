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

const googleOAuthEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

router.use((req, res, next) => {
  res.locals.googleOAuthEnabled = googleOAuthEnabled;
  next();
});

router.route("/signup").get(loadSignup).post(validateSignup, signup);

router.get("/verify-otp", loadOtpPage);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);

router.route("/login").get(loadLogin).post(validateLogin, login);
router.get("/logout", logout);

router
  .route("/forgot-password")
  .get(loadForgotPassword)
  .post(validateForgotPassword, forgotPassword);

router.route("/reset-password").get(loadResetPassword).post(validateResetPassword, resetPassword);

if (googleOAuthEnabled) {
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
} else {
  router.get("/google", (req, res) => {
    res.redirect("/login");
  });

  router.get("/google/callback", (req, res) => {
    res.redirect("/login");
  });
}

export default router;
