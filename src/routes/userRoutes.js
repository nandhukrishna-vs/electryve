import express from "express";

import {
  validateProfileUpdate,
  validateAddress,
  validateChangePassword
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
  deleteAddress,
  loadChangePassword,
  changePassword
} from "../controllers/userController.js";

import {
  isLoggedIn
} from "../middlewares/userMiddleware.js";

import upload from "../middlewares/uploadMiddleware.js";
import * as productController from "../controllers/productController.js";
import * as cartController from "../controllers/cartController.js";
import * as wishlistController from "../controllers/wishlistController.js";
import * as wishlistValidator from "../validators/wishlistValidator.js";
import * as orderController from "../controllers/orderController.js";
import * as addressValidator from "../validators/addressValidator.js";

const router = express.Router();

router.get("/", loadHome);

router.get("/profile", isLoggedIn, loadProfile);

router.get("/shop", productController.loadShop);
router.get("/shop/data", productController.getShopProductsData);
router.get("/product/:id", productController.loadProductDetails);

// Cart Routes
router.get("/cart", isLoggedIn, cartController.loadCart);
router.get("/cart/count", cartController.getCartCount);
router.post("/cart/add", cartController.addToCart);
router.patch("/cart/update-qty", isLoggedIn, cartController.updateQuantity);
router.post("/cart/update-quantity", isLoggedIn, cartController.updateQuantity);
router.delete("/cart/remove", isLoggedIn, cartController.removeItem);
router.post("/cart/remove", isLoggedIn, cartController.removeItem);

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

router.get(
  "/profile/change-password",
  isLoggedIn,
  loadChangePassword
);

router.post(
  "/profile/change-password",
  isLoggedIn,
  validateChangePassword,
  changePassword
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

// Wishlist Routes
router.get("/wishlist", isLoggedIn, wishlistController.loadWishlist);
router.get("/wishlist/count", wishlistController.getWishlistCount);
router.get("/wishlist/status", wishlistValidator.validateWishlistStatus, wishlistController.checkWishlistStatus);
router.post("/wishlist/add", isLoggedIn, wishlistValidator.validateWishlist, wishlistController.addToWishlist);
router.post("/wishlist/remove", isLoggedIn, wishlistValidator.validateWishlist, wishlistController.removeFromWishlist);

// Checkout & Order Routes
router.get("/checkout", isLoggedIn, orderController.loadCheckout);
router.post("/checkout/address", isLoggedIn, addressValidator.validateCheckoutAddress, orderController.addCheckoutAddress);
router.patch("/checkout/address/:id", isLoggedIn, addressValidator.validateCheckoutAddress, orderController.updateCheckoutAddress);
router.post("/checkout/address/:id/default", isLoggedIn, orderController.setDefaultAddress);
router.post("/checkout/place-order", isLoggedIn, orderController.placeCODOrder);
router.get("/checkout/success", isLoggedIn, orderController.loadOrderSuccess);
router.get("/order/:id", isLoggedIn, orderController.loadOrderDetails);

export default router;