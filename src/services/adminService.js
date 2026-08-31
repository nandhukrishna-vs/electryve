import bcrypt from "bcrypt";

import User from "../models/User.js";

import {
  successResponse,
  errorResponse
} from "./helpers/responseHelper.js";

const adminLogin = async ({
  body,
  session
}) => {

  const email = body.email.trim().toLowerCase();
  const password = body.password;

  const admin = await User.findOne({
    email,
    role: "ADMIN"
  });

  if (!admin) {
    return errorResponse(
      "Invalid credentials",
      "/admin/login"
    );
  }

  if (admin.status !== "ACTIVE") {
    return errorResponse(
      "Admin account unavailable",
      "/admin/login"
    );
  }

  if (!admin.password) {
    return errorResponse(
      "Invalid credentials",
      "/admin/login"
    );
  }

  const passwordMatch = await bcrypt.compare(
    password,
    admin.password
  );

  if (!passwordMatch) {
    return errorResponse(
      "Invalid credentials",
      "/admin/login"
    );
  }

  admin.lastLoginAt = new Date();

  await admin.save();

  session.admin = {
    id: admin._id,
    role: admin.role
  };

  return successResponse(
    "Welcome back!",
    "/admin/dashboard"
  );

};

const toggleUserStatus = async ({
  params
}) => {

  const user = await User.findOne({
    _id: params.id,
    role: "USER"
  });

  if (!user) {
    return errorResponse(
      "User not found",
      "/admin/users"
    );
  }

  if (user.status === "DELETED") {
    return errorResponse(
      "Deleted user cannot be modified",
      "/admin/users"
    );
  }

  user.status =
    user.status === "ACTIVE"
      ? "BLOCKED"
      : "ACTIVE";

  await user.save();

  return successResponse(
    user.status === "ACTIVE"
      ? "User unblocked successfully"
      : "User blocked successfully",
    "/admin/users"
  );

};

export {
  adminLogin,
  toggleUserStatus
};