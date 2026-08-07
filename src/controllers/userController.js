import User from "../models/User.js";
import Address from "../models/Address.js";
import * as userService from "../services/userService.js";
import Category from "../models/Category.js";
const loadHome = async (req, res) => {
  try {

    const categories = await Category.find({
      isListed: true,
      isDeleted: false
    });
    
    res.render("user/home", {
      categories,
      
    });

  } catch (error) {
    console.error(error);
    res.status(500).render("error");
  }
};

const loadProfile = async (req, res) => {
  try {
    const user = await User.findById(
      req.session.user.id
    );

    if (!user) {
      req.session.errorMessage = "User not found";
      return res.redirect("/auth/login");
    }

    res.render("user/profile", {
      profileUser: user
    });
  } catch (error) {
    console.error("Load Profile Error:", error);
    req.session.errorMessage = "Failed to load profile";
    return res.redirect("/");
  }
};

const loadEditProfile = async (req, res) => {
  try {
    const user = await User.findById(
      req.session.user.id
    );

    if (!user) {
      req.session.errorMessage = "User not found";
      return res.redirect("/");
    }

    res.render("user/edit-profile", {
      profileUser: user
    });
  } catch (error) {
    console.error("Edit Profile Error:", error);
    req.session.errorMessage = "Failed to load page";
    return res.redirect("/profile");
  }
};

const updateProfile = async (req, res) => {

  try {

    const result =
      await userService.updateProfile({

        body: req.body,

        session: req.session

      });

    if (!result.success) {

      req.session.errorMessage =
        result.message;

      return res.redirect(
        result.redirect
      );

    }

    req.session.successMessage =
      result.message;

    return res.redirect(
      result.redirect
    );

  }

  catch (error) {

    console.error(
      "Update Profile Error:",
      error
    );

    req.session.errorMessage =
      "Profile update failed";

    return res.redirect(
      "/profile/edit"
    );

  }

};

const loadAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({
      userId: req.session.user.id
    }).sort({ createdAt: -1 });

    res.render("user/addresses", {
      addresses
    });
  } catch (error) {
    console.error("Load Addresses Error:", error);
    req.session.errorMessage = "Failed to load addresses";
    return res.redirect("/profile");
  }
};

const loadAddAddress = (req, res) => {
  res.render("user/add-address");
};

const addAddress = async (req, res) => {

  try {

    const result =
      await userService.addAddress({

        body: req.body,

        session: req.session

      });

    if (!result.success) {

      req.session.errorMessage =
        result.message;

      return res.redirect(
        result.redirect
      );

    }

    req.session.successMessage =
      result.message;

    return res.redirect(
      result.redirect
    );

  }

  catch (error) {

    console.error(
      "Add Address Error:",
      error
    );

    req.session.errorMessage =
      "Failed to add address";

    return res.redirect(
      "/addresses/add"
    );

  }

};

const loadEditAddress = async (req, res) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      userId: req.session.user.id
    });

    if (!address) {
      req.session.errorMessage = "Address not found";
      return res.redirect("/addresses");
    }

    res.render("user/edit-address", {
      address
    });
  } catch (error) {
    console.error("Load Edit Address Error:", error);
    req.session.errorMessage = "Failed to load address";
    return res.redirect("/addresses");
  }
};

const updateAddress = async (req, res) => {

  try {

    const result =
      await userService.updateAddress({

        body: req.body,

        params: req.params,

        session: req.session

      });

    if (!result.success) {

      req.session.errorMessage =
        result.message;

      return res.redirect(
        result.redirect
      );

    }

    req.session.successMessage =
      result.message;

    return res.redirect(
      result.redirect
    );

  }

  catch (error) {

    console.error(
      "Update Address Error:",
      error
    );

    req.session.errorMessage =
      "Update failed";

    return res.redirect(
      "/addresses"
    );

  }

};

const deleteAddress = async (req, res) => {

  try {

    const result = await userService.deleteAddress({

      params: req.params,

      session: req.session

    });

    if (!result.success) {

      req.session.errorMessage = result.message;

      return res.redirect(result.redirect);

    }

    req.session.successMessage = result.message;

    return res.redirect(result.redirect);

  } catch (error) {

    console.error("Delete Address Error:", error);

    req.session.errorMessage = "Delete failed";

    return res.redirect("/addresses");

  }

};
const updateAvatar = async (req, res) => {

  try {

    const result = await userService.updateAvatar({
      file: req.file,
      session: req.session
    });

    // AJAX Request
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json(result);
    }

    // Normal Form Submission
    if (!result.success) {
      req.session.errorMessage = result.message;
      return res.redirect(result.redirect);
    }

    req.session.successMessage = result.message;
    return res.redirect(result.redirect);

  }

  catch (error) {

    console.error(
      "Avatar Upload Error:",
      error
    );

    req.session.errorMessage =
      "Failed to upload profile picture";

    return res.redirect("/profile");

  }

};

const loadChangePassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.session.errorMessage = "User not found";
      return res.redirect("/");
    }

    res.render("user/change-password", {
      profileUser: user
    });
  } catch (error) {
    console.error("Load Change Password Error:", error);
    req.session.errorMessage = "Failed to load page";
    return res.redirect("/profile");
  }
};

const changePassword = async (req, res, next) => {
  try {
    const result = await userService.changePassword({
      body: req.body,
      session: req.session
    });

    if (!result.success) {
      req.session.errorMessage = result.message;
      return res.redirect(result.redirect);
    }

    req.session.successMessage = result.message;
    return res.redirect(result.redirect);
  } catch (error) {
    console.error("Change Password Controller Error:", error);
    req.session.errorMessage = "Failed to update password";
    return res.redirect("/profile/change-password");
  }
};

export {
  loadHome,
  loadProfile,
  loadEditProfile,
  updateProfile,
  updateAvatar,
  loadAddresses,
  loadAddAddress,
  addAddress,
  loadEditAddress,
  updateAddress,
  deleteAddress,
  loadChangePassword,
  changePassword
};