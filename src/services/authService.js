import bcrypt from "bcrypt";

import User from "../models/User.js";
import Otp from "../models/Otp.js";

import generateOtp from "../utils/generateOtp.js";
import sendEmail from "../utils/sendEmail.js";
import {
  successResponse,
  errorResponse
} from "./helpers/responseHelper.js";
const OTP_EXPIRY_MS = 60 * 1000;

import {
  createAndSendOtp
} from "./helpers/otpHelper.js";

const signup = async ({body,session}) => {

  const fullName = body.fullName.trim();
  const email = body.email.trim().toLowerCase();
  const phone = body.phone?.trim() || "";
  const password = body.password;

  const existingUser = await User.findOne({ email });

  if (existingUser) {

  return errorResponse(
    existingUser.status === "BLOCKED"
      ? "This account is blocked"
      : "Email already registered",
    "/auth/signup"
  );

}

  if (phone) {

    const existingPhone = await User.findOne({ phone });

    if (existingPhone) {

        return errorResponse(
        "Phone number already registered",
        "/auth/signup"
        );

    }

  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await createAndSendOtp({
    email,
    purpose: "SIGNUP",
    subject: "Electryve OTP Verification",
    heading: "Your OTP Code"
  });

  session.pendingSignup = {
    fullName,
    email,
    phone,
    password: hashedPassword
  };

    return successResponse(
    "OTP sent successfully",
    "/auth/verify-otp"
    );

};

import generateReferralCode from "../utils/generateReferralCode.js";

const generateUniqueReferralCode = async (fullName) => {

  let referralCode;
  let exists = true;

  while (exists) {

    referralCode = generateReferralCode(fullName);

    exists = await User.findOne({
      referralCode
    });

  }

  return referralCode;

};
const verifyOtp = async ({ body, session }) => {

  const otp = body.otp.trim();

  const pendingSignup = session.pendingSignup;

  if (!pendingSignup) {

  return errorResponse(
    "Signup session expired",
    "/auth/signup"
  );

}

  const storedOtp = await Otp.findOne({
    email: pendingSignup.email,
    purpose: "SIGNUP"
  });

  if (!storedOtp) {

  return errorResponse(
    "OTP expired. Please resend OTP.",
    "/auth/verify-otp"
  );

}

  if (String(storedOtp.otp) !== String(otp)) {

    return errorResponse(
    "Invalid OTP",
    "/auth/verify-otp"
    );

  }

  const referralCode =
    await generateUniqueReferralCode(
      pendingSignup.fullName
    );

  const user = await User.create({

    fullName: pendingSignup.fullName,

    email: pendingSignup.email,

    phone: pendingSignup.phone,

    password: pendingSignup.password,

    authProvider: "LOCAL",

    isEmailVerified: true,

    referralCode

  });

  await Otp.deleteMany({

    email: pendingSignup.email,

    purpose: "SIGNUP"

  });

  delete session.pendingSignup;

  session.user = {

    id: user._id,

    role: user.role

  };

    return successResponse(
    "Account created successfully",
    "/"
    );

};

const resendOtp = async ({ session }) => {

  const pendingSignup = session.pendingSignup;

  if (!pendingSignup) {
    return errorResponse(
      "Signup session expired",
      "/auth/signup"
    );
  }

  await createAndSendOtp({
    email: pendingSignup.email,
    purpose: "SIGNUP",
    subject: "Electryve OTP Verification",
    heading: "Your New OTP Code"
  });

  return successResponse(
    "New OTP sent",
    "/auth/verify-otp"
  );

};

const login = async ({ body, session }) => {

  const email = body.email.trim().toLowerCase();
  const password = body.password;

  const user = await User.findOne({ email });

  if (!user) {
    return errorResponse(
      "Invalid email or password",
      "/auth/login"
    );
  }

  if (user.status === "BLOCKED") {
    return errorResponse(
      "Your account is blocked",
      "/auth/login"
    );
  }

  if (user.status === "DELETED") {
    return errorResponse(
      "Account not available",
      "/auth/login"
    );
  }

  if (user.authProvider === "GOOGLE") {
    return errorResponse(
      "Please login using Google",
      "/auth/login"
    );
  }

  const passwordMatch = await bcrypt.compare(
    password,
    user.password
  );

  if (!passwordMatch) {
    return errorResponse(
      "Invalid email or password",
      "/auth/login"
    );
  }

  user.lastLoginAt = new Date();

  await user.save();

  session.user = {
    id: user._id,
    role: user.role
  };

  return successResponse(
    "Login successful",
    "/"
  );

};

const forgotPassword = async ({ body, session }) => {

  const email = body.email.trim().toLowerCase();

  const user = await User.findOne({ email });

  if (!user) {
    return errorResponse(
      "No account found with this email",
      "/auth/forgot-password"
    );
  }

  if (user.status !== "ACTIVE") {
    return errorResponse(
      "Account unavailable",
      "/auth/forgot-password"
    );
  }

  if (user.authProvider === "GOOGLE") {
    return errorResponse(
      "Google accounts cannot reset password",
      "/auth/forgot-password"
    );
  }

  await createAndSendOtp({
    email,
    purpose: "FORGOT_PASSWORD",
    subject: "Electryve Password Reset OTP",
    heading: "Password Reset OTP"
  });

  session.resetEmail = email;

  return successResponse(
    "OTP sent successfully",
    "/auth/reset-password"
  );

};

const resetPassword = async ({
  body,
  session
}) => {

  const {
    otp,
    newPassword,
    confirmPassword
  } = body;

  const email = session.resetEmail;

  if (!email) {
    return errorResponse(
      "Reset session expired",
      "/auth/forgot-password"
    );
  }

  if (newPassword !== confirmPassword) {
    return errorResponse(
      "Passwords do not match",
      "/auth/reset-password"
    );
  }

  const storedOtp = await Otp.findOne({
    email,
    purpose: "FORGOT_PASSWORD"
  });

  if (!storedOtp) {
    return errorResponse(
      "OTP expired",
      "/auth/reset-password"
    );
  }

  if (String(storedOtp.otp) !== String(otp).trim()) {
    return errorResponse(
      "Invalid OTP",
      "/auth/reset-password"
    );
  }

  const user = await User.findOne({ email });

  if (!user) {
    return errorResponse(
      "User not found",
      "/auth/forgot-password"
    );
  }

  const samePassword = await bcrypt.compare(
    newPassword,
    user.password
  );

  if (samePassword) {
    return errorResponse(
      "New password cannot be same as old password",
      "/auth/reset-password"
    );
  }

  user.password = await bcrypt.hash(
    newPassword,
    10
  );

  await user.save();

  await Otp.deleteMany({
    email,
    purpose: "FORGOT_PASSWORD"
  });

  delete session.resetEmail;

  return successResponse(
    "Password reset successful",
    "/auth/login"
  );

};
export {
  signup,
  verifyOtp,
  resendOtp,
  login,
  forgotPassword,
  resetPassword
};