import User from "../models/User.js";

const isAdmin = async (req, res, next) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const user = await User.findById(req.session.admin.id);

    if (!user) {
      req.session.destroy(() => {});
      res.clearCookie("admin.sid");
      return res.redirect("/admin/login");
    }

    if (user.role !== "ADMIN") {
      req.session.errorMessage = "Access denied";
      return res.redirect("/");
    }

    if (user.status !== "ACTIVE") {
      req.session.destroy(() => {});
      res.clearCookie("admin.sid");
      return res.redirect("/admin/login");
    }

    req.currentAdmin = user;

    next();
  } catch (error) {
    console.error("Admin Middleware Error:", error);
    return res.redirect("/admin/login");
  }
};

export { isAdmin };