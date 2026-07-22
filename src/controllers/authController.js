

import User from "../models/User.js";
import Otp from "../models/Otp.js";

import * as authService from "../services/authService.js";
import generateOtp from "../utils/generateOtp.js";
import sendEmail from "../utils/sendEmail.js";

const OTP_EXPIRY_MS = 60 * 1000;

const loadSignup = (req, res) => {
  if (req.session.user) {
    return res.redirect("/");
  }

  res.render("auth/signup");
};

const loadLogin = (req, res) => {
  if (req.session.user) {
    return res.redirect("/");
  }

  res.render("auth/login");
};

const loadOtpPage = (req, res) => {
  if (!req.session.pendingSignup) {
    return res.redirect("/auth/signup");
  }

  res.render("auth/verify-otp");
};

const signup = async (req, res) => {

  try {

    const result = await authService.signup({
    body: req.body,
    session: req.session
});

    if (!result.success) {

      req.session.errorMessage = result.message;

      return res.redirect(result.redirect);

    }

    req.session.successMessage = result.message;

    return res.redirect(result.redirect);

  } catch (error) {

    console.error("Signup Error:", error);

    req.session.errorMessage = "Signup failed";

    return res.redirect("/auth/signup");

  }

};

const verifyOtp = async (req, res) => {

  try {

    const result =
      await authService.verifyOtp({

        body: req.body,

        session: req.session

      });

    if (req.xhr || req.headers.accept?.includes("application/json")) {

  return res.json(result);

}

// If request comes from AJAX
if (req.xhr || req.headers.accept?.includes("application/json")) {
  return res.json(result);
}

// Normal form submission
if (!result.success) {
  req.session.errorMessage = result.message;
  return res.redirect(result.redirect);
}

req.session.successMessage = result.message;
return res.redirect(result.redirect);

  }

  catch (error) {

    console.error(
      "OTP Verification Error:",
      error
    );

    req.session.errorMessage =
      "OTP verification failed";

    return res.redirect(
      "/auth/verify-otp"
    );

  }

};

const resendOtp = async (req, res) => {

  try {

    const result = await authService.resendOtp({
      session: req.session
    });

    if (req.xhr || req.headers.accept?.includes("application/json")) {
  return res.json(result);
}

if (!result.success) {
  req.session.errorMessage = result.message;
  return res.redirect(result.redirect);
}

req.session.successMessage = result.message;
return res.redirect(result.redirect);

  } catch (error) {

    console.error("Resend OTP Error:", error);

    req.session.errorMessage = "Failed to resend OTP";

    return res.redirect("/auth/verify-otp");

  }

};

const login = async (req, res) => {

  try {

    const result = await authService.login({
      body: req.body,
      session: req.session
    });

    if (!result.success) {

      req.session.errorMessage =
        result.message;

      return res.redirect(
        result.redirect
      );

    }

    req.session.successMessage =
      result.message;

    return res.redirect(
      result.redirect
    );

  }

  catch (error) {

    console.error(
      "Login Error:",
      error
    );

    req.session.errorMessage =
      "Login failed";

    return res.redirect(
      "/auth/login"
    );

  }

};

const logout = (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout Error:", error);
      return res.redirect("/");
    }

    res.clearCookie("connect.sid");
    return res.redirect("/auth/login");
  });
};

const loadForgotPassword = (req, res) => {
  res.render("auth/forgot-password");
};

const forgotPassword = async (req, res) => {

  try {

    const result = await authService.forgotPassword({
      body: req.body,
      session: req.session
    });

    if (!result.success) {

      req.session.errorMessage = result.message;

      return res.redirect(result.redirect);

    }

    req.session.successMessage = result.message;

    return res.redirect(result.redirect);

  } catch (error) {

    console.error(
      "Forgot Password Error:",
      error
    );

    req.session.errorMessage =
      "Password reset failed";

    return res.redirect(
      "/auth/forgot-password"
    );

  }

};

const loadResetPassword = (req, res) => {
  res.render("auth/reset-password");
};

const resetPassword = async (req, res) => {

  try {

    const result =
      await authService.resetPassword({

        body: req.body,

        session: req.session

      });

    if (!result.success) {

      req.session.errorMessage =
        result.message;

      return res.redirect(
        result.redirect
      );

    }

    req.session.successMessage =
      result.message;

    return res.redirect(
      result.redirect
    );

  }

  catch (error) {

    console.error(
      "Reset Password Error:",
      error
    );

    req.session.errorMessage =
      "Password reset failed";

    return res.redirect(
      "/auth/reset-password"
    );

  }

};

const googleAuthCallback = async (req, res) => {
  try {
    if (!req.user) {
      req.session.errorMessage =
        "Google login failed";
      return res.redirect("/auth/login");
    }

    req.session.user = {
      id: req.user._id,
      role: req.user.role
    };

    req.user.lastLoginAt = new Date();
    await req.user.save();

    return res.redirect("/");
  } catch (error) {
    console.error("Google Auth Error:", error);
    req.session.errorMessage =
      "Google login failed";
    return res.redirect("/auth/login");
  }
};

export {
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
};