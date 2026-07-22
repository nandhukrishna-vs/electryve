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

export {
  validateProfileUpdate,
  validateAddress
};