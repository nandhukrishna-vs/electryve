import * as wishlistService from "../services/wishlistService.js";

const loadWishlist = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const wishlistItems = await wishlistService.getWishlist(userId);

    res.render("user/wishlist", {
      layout: "layouts/user-layout",
      title: "My Wishlist",
      wishlistItems
    });
  } catch (error) {
    next(error);
  }
};

const getWishlistCount = async (req, res, next) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.json({ success: true, count: 0 });
    }

    const count = await wishlistService.getWishlistCount(userId);
    res.json({ success: true, count });
  } catch (error) {
    next(error);
  }
};

const checkWishlistStatus = async (req, res, next) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.json({ success: true, inWishlist: false });
    }

    const { productId, variantId } = req.query;
    const inWishlist = await wishlistService.isInWishlist(userId, productId, variantId);

    res.json({ success: true, inWishlist });
  } catch (error) {
    next(error);
  }
};

const addToWishlist = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { productId, variantId } = req.body;

    const result = await wishlistService.addToWishlist(userId, productId, variantId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

const removeFromWishlist = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { productId, variantId } = req.body;

    const result = await wishlistService.removeFromWishlist(userId, productId, variantId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export {
  loadWishlist,
  getWishlistCount,
  checkWishlistStatus,
  addToWishlist,
  removeFromWishlist
};
