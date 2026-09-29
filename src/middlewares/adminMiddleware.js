import User from "../models/User.js";

const isAdmin = async (req, res, next) => {
  try {
    if (!req.session.admin) {
      if (req.path === "/image-proxy" || req.xhr) {
        return res.status(401).send("Unauthorized");
      }
      return res.redirect("/admin/login");
    }

    const user = await User.findById(req.session.admin.id);

    if (!user) {
      req.session.destroy(() => {});
      res.clearCookie("admin.sid");
      if (req.path === "/image-proxy" || req.xhr) {
        return res.status(401).send("Unauthorized");
      }
      return res.redirect("/admin/login");
    }

    if (user.role !== "ADMIN") {
      req.session.errorMessage = "Access denied";
      if (req.path === "/image-proxy" || req.xhr) {
        return res.status(403).send("Forbidden");
      }
      return res.redirect("/");
    }

    if (user.status !== "ACTIVE") {
      req.session.destroy(() => {});
      res.clearCookie("admin.sid");
      if (req.path === "/image-proxy" || req.xhr) {
        return res.status(401).send("Unauthorized");
      }
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