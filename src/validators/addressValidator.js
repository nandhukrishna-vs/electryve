const validateCheckoutAddress = (req, res, next) => {
  const {
    fullName,
    phone,
    addressLine1,
    city,
    state,
    pinCode
  } = req.body;

  if (!fullName?.trim() || fullName.trim().length < 3 || fullName.trim().length > 50) {
    return res.status(400).json({
      success: false,
      message: "Full name must be between 3 and 50 characters."
    });
  }

  if (!phone || !/^[0-9]{10}$/.test(phone.trim())) {
    return res.status(400).json({
      success: false,
      message: "Phone number must be exactly 10 digits."
    });
  }

  if (!addressLine1?.trim()) {
    return res.status(400).json({
      success: false,
      message: "Address Line 1 is required."
    });
  }

  if (!city?.trim()) {
    return res.status(400).json({
      success: false,
      message: "City is required."
    });
  }

  if (!state?.trim()) {
    return res.status(400).json({
      success: false,
      message: "State is required."
    });
  }

  const pinStr = String(pinCode || "").trim();
  if (!pinStr || !/^[0-9]{6}$/.test(pinStr)) {
    return res.status(400).json({
      success: false,
      message: "Pin Code must be a 6-digit number."
    });
  }

  next();
};

export { validateCheckoutAddress };
