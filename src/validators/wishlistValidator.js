import mongoose from "mongoose";

const validateWishlist = (req, res, next) => {
  const { productId, variantId } = req.body;

  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid or missing Product ID."
    });
  }

  if (!variantId || !mongoose.Types.ObjectId.isValid(variantId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid or missing Variant ID."
    });
  }

  next();
};

const validateWishlistStatus = (req, res, next) => {
  const { productId, variantId } = req.query;

  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid or missing Product ID."
    });
  }

  if (!variantId || !mongoose.Types.ObjectId.isValid(variantId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid or missing Variant ID."
    });
  }

  next();
};

export { validateWishlist, validateWishlistStatus };
