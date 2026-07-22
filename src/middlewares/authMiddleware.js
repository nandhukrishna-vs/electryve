import User from "../models/User.js";

const isLoggedIn = async (req, res, next) => {
  try {
    if (!req.session.user) {
      req.session.errorMessage = "Please login first";
      return res.redirect("/login");
    }

    const user = await User.findById(req.session.user.id);

    if (!user) {
      req.session.destroy(() => {});
      res.clearCookie("connect.sid");
      return res.redirect("/login");
    }

    if (user.status === "BLOCKED") {
      req.session.destroy(() => {});
      res.clearCookie("connect.sid");
      return res.redirect("/login");
    }

    if (user.status === "DELETED") {
      req.session.destroy(() => {});
      res.clearCookie("connect.sid");
      return res.redirect("/login");
    }

    req.currentUser = user;

    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    return res.redirect("/login");
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