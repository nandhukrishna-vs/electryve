import express from "express";

import {
  validateProfileUpdate,
  validateAddress
} from "../validators/userValidator.js";

import {
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
  deleteAddress
} from "../controllers/userController.js";

import {
  isLoggedIn
} from "../middlewares/userMiddleware.js";

import upload from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.get("/", loadHome);

router.get("/profile", isLoggedIn, loadProfile);

router.get(
  "/profile/edit",
  isLoggedIn,
  loadEditProfile
);

router.post(
  "/profile/edit",
  isLoggedIn,
  validateProfileUpdate,
  updateProfile
);



router.post(
  "/profile/avatar",
  isLoggedIn,
  upload.single("avatar"),
  updateAvatar
);

router.get("/addresses", isLoggedIn, loadAddresses);

router.get("/addresses/add", isLoggedIn, loadAddAddress);

router.post(
  "/addresses/add",
  isLoggedIn,
  validateAddress,
  addAddress
);

router.get(
  "/addresses/:id/edit",
  isLoggedIn,
  loadEditAddress
);

router.patch(
  "/addresses/:id/edit",
  isLoggedIn,
  validateAddress,
  updateAddress
);

router.delete(
  "/addresses/:id/delete",
  isLoggedIn,
  deleteAddress
);

export default router;