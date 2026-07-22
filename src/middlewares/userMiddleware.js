import User from "../models/User.js";
const isLoggedIn = async (req, res, next) => {

  if (!req.session.user) {

    req.session.errorMessage = "Please login first";

    return res.redirect("/auth/login");

  }

  const user = await User.findById(req.session.user.id);

  if (!user) {

    req.session.destroy(() => {});

    return res.redirect("/auth/login");

  }

  if (user.status === "BLOCKED") {

    req.session.destroy(() => {});

    return res.redirect("/auth/login");

  }

  if (user.status === "DELETED") {

    req.session.destroy(() => {});

    return res.redirect("/auth/login");

  }

  next();

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