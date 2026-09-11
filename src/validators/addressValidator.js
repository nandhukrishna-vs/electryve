const validateCheckoutAddress = (req, res, next) => {
  const {
    fullName,
    phone,
    addressLine1,
    addressLine2,
    landmark,
    city,
    state,
    pinCode,
    pincode,
    addressType
  } = req.body;

  const errors = {};

  // Full Name validation
  const trimmedName = fullName ? String(fullName).trim() : "";
  if (!trimmedName) {
    errors.fullName = "Full name is required.";
  } else if (trimmedName.length < 3 || trimmedName.length > 50) {
    errors.fullName = "Full name must be between 3 and 50 characters.";
  } else if (!/^[A-Za-z\s.'-]+$/.test(trimmedName)) {
    errors.fullName = "Full name can only contain letters and spaces.";
  }

  // Phone number validation
  const trimmedPhone = phone ? String(phone).trim() : "";
  if (!trimmedPhone) {
    errors.phone = "Phone number is required.";
  } else if (!/^[0-9]{10}$/.test(trimmedPhone)) {
    errors.phone = "Phone number must be exactly 10 digits.";
  }

  // Address Line 1 validation
  const trimmedAddress1 = addressLine1 ? String(addressLine1).trim() : "";
  if (!trimmedAddress1) {
    errors.addressLine1 = "Address Line 1 is required.";
  } else if (trimmedAddress1.length < 5) {
    errors.addressLine1 = "Address Line 1 must be at least 5 characters.";
  } else if (trimmedAddress1.length > 150) {
    errors.addressLine1 = "Address Line 1 cannot exceed 150 characters.";
  }

  // Address Line 2 validation (optional)
  if (addressLine2 && String(addressLine2).trim().length > 150) {
    errors.addressLine2 = "Address Line 2 cannot exceed 150 characters.";
  }

  // Landmark validation (optional)
  if (landmark && String(landmark).trim().length > 100) {
    errors.landmark = "Landmark cannot exceed 100 characters.";
  }

  // City validation
  const trimmedCity = city ? String(city).trim() : "";
  if (!trimmedCity) {
    errors.city = "City is required.";
  } else if (trimmedCity.length < 2) {
    errors.city = "City must be at least 2 characters.";
  } else if (!/^[A-Za-z\s.-]+$/.test(trimmedCity)) {
    errors.city = "City can only contain letters and spaces.";
  }

  // State validation
  const trimmedState = state ? String(state).trim() : "";
  if (!trimmedState) {
    errors.state = "State is required.";
  } else if (trimmedState.length < 2) {
    errors.state = "State must be at least 2 characters.";
  } else if (!/^[A-Za-z\s.-]+$/.test(trimmedState)) {
    errors.state = "State can only contain letters and spaces.";
  }

  // Pin Code validation
  const pinVal = pinCode !== undefined && pinCode !== null && pinCode !== "" ? pinCode : pincode;
  const pinStr = pinVal !== undefined && pinVal !== null ? String(pinVal).trim() : "";
  if (!pinStr) {
    errors.pinCode = "Pin Code is required.";
  } else if (!/^[0-9]{6}$/.test(pinStr)) {
    errors.pinCode = "Pin Code must be a 6-digit number.";
  }

  // Address Type validation (optional)
  if (addressType && !["HOME", "OFFICE", "OTHER"].includes(String(addressType).toUpperCase())) {
    errors.addressType = "Address type must be HOME, OFFICE, or OTHER.";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: Object.values(errors)[0],
      errors
    });
  }

  next();
};

export { validateCheckoutAddress };
