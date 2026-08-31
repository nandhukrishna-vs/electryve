import bcrypt from "bcrypt";
import User from "../models/User.js";
import * as adminService from "../services/adminService.js";

const loadAdminLogin = (req, res) => {
  if (req.session.admin?.role === "ADMIN") {
    return res.redirect("/admin/dashboard");
  }

  res.render("admin/login", {
    layout: "layouts/admin-layout"
  });
};

const adminLogin = async (req, res) => {

  try {

    const result =
      await adminService.adminLogin({

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
      "Admin Login Error:",
      error
    );

    req.session.errorMessage =
      "Admin login failed";

    return res.redirect(
      "/admin/login"
    );

  }

};

const adminLogout = (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.redirect("/admin/dashboard");
    }

    res.clearCookie("admin.sid");
    return res.redirect("/admin/login");
  });
};

const loadUsers = async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    const limit = 10;
    const search = req.query.search?.trim() || "";

    if (page < 1) page = 1;

    const skip = (page - 1) * limit;

    const filter = {
      role: "USER"
    };

    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }
      ];
    }

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalUsers = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalUsers / limit);

    res.render("admin/users", {
      layout: "layouts/admin-layout",
      users,
      currentPage: page,
      totalPages,
      search
    });
  } catch (error) {
    console.error("Load Users Error:", error);
    res.redirect("/admin/dashboard");
  }
};

const toggleUserStatus = async (req, res) => {

  try {

    const result =
      await adminService.toggleUserStatus({

        params: req.params

      });

    // AJAX Request
    if (req.xhr || req.headers.accept?.includes("application/json")) {

      return res.json(result);

    }

    // Normal Form
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
      "Toggle User Error:",
      error
    );

    // AJAX
    if (req.xhr || req.headers.accept?.includes("application/json")) {

      return res.status(500).json({

        success: false,

        message: "Failed to update user status"

      });

    }

    // Normal Request
    req.session.errorMessage =
      "Failed to update user status";

    return res.redirect(
      "/admin/users"
    );

  }

};

export {
  loadAdminLogin,
  adminLogin,
  adminLogout,
  loadUsers,
  toggleUserStatus
};