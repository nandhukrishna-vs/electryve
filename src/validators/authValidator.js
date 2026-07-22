const validateSignup = (req, res, next) => {
  const {
  fullName,
  email,
  phone,
  password,
  confirmPassword
} = req.body;

  if (!fullName?.trim() || fullName.trim().length < 3) {
    req.session.errorMessage =
      "Full name must be at least 3 characters";
    return res.redirect("/auth/signup");
  }

  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    req.session.errorMessage =
      "Invalid email address";
    return res.redirect("/auth/signup");
  }

  if (!password || password.length < 6) {
    req.session.errorMessage =
      "Password must be at least 6 characters";
    return res.redirect("/auth/signup");
  }

  if (password !== confirmPassword) {
  req.session.errorMessage =
    "Passwords do not match";
  return res.redirect("/auth/signup");
}

  if (phone && !/^[0-9]{10}$/.test(phone)) {
    req.session.errorMessage =
      "Phone number must be 10 digits";
    return res.redirect("/auth/signup");
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password?.trim()) {
    req.session.errorMessage =
      "Email and password are required";
    return res.redirect("/auth/login");
  }

  next();
};

const validateForgotPassword = (
  req,
  res,
  next
) => {
  const { email } = req.body;

  if (!email?.trim()) {
    req.session.errorMessage =
      "Email is required";
    return res.redirect("/auth/forgot-password");
  }

  next();
};

const validateResetPassword = (
  req,
  res,
  next
) => {
  const {
    otp,
    newPassword,
    confirmPassword
  } = req.body;

  if (!otp?.trim()) {
    req.session.errorMessage =
      "OTP is required";
    return res.redirect("/auth/reset-password");
  }

  if (newPassword.length < 6) {
    req.session.errorMessage =
      "Password must be at least 6 characters";
    return res.redirect("/auth/reset-password");
  }

  if (newPassword !== confirmPassword) {
    req.session.errorMessage =
      "Passwords do not match";
    return res.redirect("/auth/reset-password");
  }

  next();
};

export {
  validateSignup,
  validateLogin,
  validateForgotPassword,
  validateResetPassword
};