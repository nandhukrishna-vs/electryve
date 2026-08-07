import User from "../models/User.js";

const validateProfileUpdate = (
  req,
  res,
  next
) => {
  const { fullName, phone } = req.body;

  if (!fullName?.trim()) {
    req.session.errorMessage =
      "Name is required";
    return res.redirect("/profile/edit");
  }

  if (phone && !/^[0-9]{10}$/.test(phone)) {
    req.session.errorMessage =
      "Phone must be 10 digits";
    return res.redirect("/profile/edit");
  }

  next();
};

const validateAddress = (
  req,
  res,
  next
) => {
  const {
    fullName,
    phone,
    city,
    state,
    pinCode
  } = req.body;

  if (!fullName?.trim()) {
    req.session.errorMessage =
      "Full name required";
    return res.redirect("back");
  }
  if (
  !["HOME", "OFFICE", "OTHER"].includes(req.body.addressType)
) {
  req.session.errorMessage =
    "Invalid address type";
  return res.redirect("back");
}

  if (!/^[0-9]{10}$/.test(phone)) {
    req.session.errorMessage =
      "Phone must be 10 digits";
    return res.redirect("back");
  }

  if (!city?.trim() || !state?.trim()) {
    req.session.errorMessage =
      "City and state required";
    return res.redirect("back");
  }

  if (!/^[0-9]{6}$/.test(pinCode)) {
    req.session.errorMessage =
      "PIN code must be 6 digits";
    return res.redirect("back");
  }

  next();
};

const validateChangePassword = async (
  req,
  res,
  next
) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  try {
    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.session.errorMessage = "User not found";
      return res.redirect("/auth/login");
    }

    if (user.password) {
      if (!currentPassword || !currentPassword.trim()) {
        req.session.errorMessage = "Current password is required";
        return res.redirect("/profile/change-password");
      }
    }

    if (!newPassword || newPassword.trim().length < 8) {
      req.session.errorMessage = "New password must be at least 8 characters";
      return res.redirect("/profile/change-password");
    }

    if (newPassword !== confirmPassword) {
      req.session.errorMessage = "Confirm password must match new password";
      return res.redirect("/profile/change-password");
    }

    next();
  } catch (error) {
    console.error("validateChangePassword Error:", error);
    req.session.errorMessage = "Validation failed";
    return res.redirect("/profile/change-password");
  }
};

export {
  validateProfileUpdate,
  validateAddress,
  validateChangePassword
};