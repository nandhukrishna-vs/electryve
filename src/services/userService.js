import User from "../models/User.js";
import Address from "../models/Address.js";
import {
  successResponse,
  errorResponse
} from "./helpers/responseHelper.js";



const updateProfile = async ({
  body,
  session
}) => {

  const fullName = body.fullName.trim();
  const phone = body.phone?.trim() || null;

  const user = await User.findById(session.user.id);

  if (!user) {
    return errorResponse(
      "User not found",
      "/auth/login"
    );
  }

  user.fullName = fullName;
  user.phone = phone;

  await user.save();

  return successResponse(
    "Profile updated successfully",
    "/profile"
  );

};
const addAddress = async ({
  body,
  session
}) => {

  const {
  fullName,
  addressType,
  phone,
  addressLine1,
  addressLine2,
  landmark,
  city,
  state,
  pinCode,
  country,
  isDefault
} = body;

  if (isDefault === "on") {

    await Address.updateMany(
      {
        userId: session.user.id
      },
      {
        $set: {
          isDefault: false
        }
      }
    );

  }

  await Address.create({

    userId: session.user.id,

    fullName: fullName.trim(),

    addressType,

    phone: phone.trim(),

    addressLine1: addressLine1.trim(),

    addressLine2: addressLine2?.trim() || "",

    landmark: landmark?.trim() || "",

    city: city.trim(),

    state: state.trim(),

    pinCode,

    country: country?.trim() || "India",

    isDefault: isDefault === "on"

  });

  return successResponse(
    "Address added successfully",
    "/addresses"
  );

};
const updateAddress = async ({
  body,
  params,
  session
}) => {

  const addressId = params.id;

  const {
  fullName,
  addressType,
  phone,
  addressLine1,
  addressLine2,
  landmark,
  city,
  state,
  pinCode,
  country,
  isDefault
} = body;

  const address = await Address.findOne({
    _id: addressId,
    userId: session.user.id
  });

  if (!address) {
    return errorResponse(
      "Address not found",
      "/addresses"
    );
  }

  if (isDefault === "on") {

    await Address.updateMany(
      {
        userId: session.user.id,
        _id: { $ne: addressId }
      },
      {
        $set: {
          isDefault: false
        }
      }
    );

  }

  address.fullName = fullName.trim();
  address.addressType = addressType;
  address.phone = phone.trim();
  address.addressLine1 = addressLine1.trim();
  address.addressLine2 = addressLine2?.trim() || "";
  address.landmark = landmark?.trim() || "";
  address.city = city.trim();
  address.state = state.trim();
  address.pinCode = pinCode;
  address.country = country?.trim() || "India";
  address.isDefault = isDefault === "on";

  await address.save();

  return successResponse(
    "Address updated successfully",
    "/addresses"
  );

};

const deleteAddress = async ({
  params,
  session
}) => {

  const address = await Address.findOne({
    _id: params.id,
    userId: session.user.id
  });

  if (!address) {
    return errorResponse(
      "Address not found",
      "/addresses"
    );
  }

  await address.deleteOne();

  return successResponse(
    "Address deleted successfully",
    "/addresses"
  );

};

const updateAvatar = async ({
  file,
  session
}) => {

  if (!file) {
    return errorResponse(
      "Please select an image",
      "/profile"
    );
  }

  const user = await User.findById(session.user.id);

  if (!user) {
    return errorResponse(
      "User not found",
      "/auth/login"
    );
  }

  user.avatar = `/uploads/avatars/${file.filename}`;

  await user.save();

  return {

    success: true,

    message: "Profile picture updated successfully",

    redirect: "/profile",

    avatar: user.avatar

};

};

export {
  updateProfile,
  addAddress,
  updateAddress,
  deleteAddress,
  updateAvatar
};