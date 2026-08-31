import User from "../models/User.js";

const isLoggedIn = async (req, res, next) => {
  if (!req.session.user) {
    req.session.errorMessage = "Please login first";
    return res.redirect("/auth/login");
  }

  try {
    const user = await User.findById(req.session.user.id);

    if (!user) {
      req.session.destroy(() => {});
      res.clearCookie("user.sid");
      return res.redirect("/auth/login");
    }

    if (user.status === "BLOCKED") {
      req.session.destroy(() => {});
      res.clearCookie("user.sid");
      return res.redirect("/auth/login");
    }

    if (user.status === "DELETED") {
      req.session.destroy(() => {});
      res.clearCookie("user.sid");
      return res.redirect("/auth/login");
    }

    req.currentUser = user;
    next();
  } catch (error) {
    console.error("User Middleware Error:", error);
    return res.redirect("/auth/login");
  }
};

const isLoggedOut = (req, res, next) => {
  if (req.session.user) {
    return res.redirect("/");
  }

  next();
};

export {
  isLoggedIn,
  isLoggedOut
};