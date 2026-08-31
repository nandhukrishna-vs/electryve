import Wishlist from "../models/Wishlist.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Brand from "../models/Brand.js";

const getWishlist = async (userId) => {
  const wishlist = await Wishlist.findOne({ user: userId }).populate({
    path: "items.product",
    populate: [
      { path: "category" },
      { path: "brand" }
    ]
  });

  if (!wishlist) {
    return [];
  }

  const processedItems = wishlist.items.map((item) => {
    const product = item.product;
    let isAvailable = true;
    let unavailabilityReason = "";

    // 1. Check Product exists and is active/listed
    if (!product || product.isDeleted || !product.isListed) {
      isAvailable = false;
      unavailabilityReason = "This product is no longer available.";
    }

    // 2. Check Category is active/listed
    if (isAvailable && (!product.category || product.category.isDeleted || !product.category.isListed)) {
      isAvailable = false;
      unavailabilityReason = "This product is no longer available.";
    }

    // 3. Check Brand is active/listed
    if (isAvailable && (!product.brand || product.brand.isDeleted || !product.brand.isListed)) {
      isAvailable = false;
      unavailabilityReason = "This product is no longer available.";
    }

    // 4. Find Selected Variant
    let variant = null;
    if (isAvailable && product.variants) {
      variant = product.variants.find(
        (v) => String(v._id) === String(item.variantId)
      );

      if (!variant || !variant.isListed) {
        isAvailable = false;
        unavailabilityReason = "This product is no longer available.";
      }
    }

    return {
      productId: product?._id || item.product,
      variantId: item.variantId,
      addedAt: item.addedAt,
      product: product ? {
        name: product.name,
        category: product.category?.name,
        brand: product.brand?.name
      } : null,
      variant: variant ? {
        color: variant.color,
        storage: variant.storage,
        sku: variant.sku,
        regularPrice: variant.regularPrice,
        salePrice: variant.salePrice,
        stock: variant.stock,
        images: variant.images
      } : null,
      isAvailable,
      unavailabilityReason
    };
  });

  return processedItems;
};

const addToWishlist = async (userId, productId, variantId) => {
  // Validate Product exists and is active/listed
  const product = await Product.findById(productId)
    .populate("category")
    .populate("brand");

  if (!product || product.isDeleted || !product.isListed) {
    return { success: false, message: "This product is no longer available." };
  }

  // Check Category
  if (!product.category || product.category.isDeleted || !product.category.isListed) {
    return { success: false, message: "This product is no longer available." };
  }

  // Check Brand
  if (!product.brand || product.brand.isDeleted || !product.brand.isListed) {
    return { success: false, message: "This product is no longer available." };
  }

  // Check Variant
  const variant = product.variants.find(
    (v) => String(v._id) === String(variantId)
  );

  if (!variant || !variant.isListed) {
    return { success: false, message: "This product is no longer available." };
  }

  // Retrieve or create Wishlist
  let wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) {
    wishlist = new Wishlist({ user: userId, items: [] });
  }

  // Check duplicate
  const alreadyExists = wishlist.items.some(
    (item) =>
      String(item.product) === String(productId) &&
      String(item.variantId) === String(variantId)
  );

  if (alreadyExists) {
    return {
      success: true,
      message: "Product is already in your wishlist.",
      count: wishlist.items.length,
      inWishlist: true
    };
  }

  wishlist.items.push({
    product: productId,
    variantId: variantId,
    addedAt: new Date()
  });

  await wishlist.save();

  return {
    success: true,
    message: "Added to wishlist.",
    count: wishlist.items.length,
    inWishlist: true
  };
};

const removeFromWishlist = async (userId, productId, variantId) => {
  const wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) {
    return { success: true, message: "Removed from wishlist.", count: 0, inWishlist: false };
  }

  const originalLength = wishlist.items.length;
  wishlist.items = wishlist.items.filter(
    (item) =>
      !(
        String(item.product) === String(productId) &&
        String(item.variantId) === String(variantId)
      )
  );

  if (wishlist.items.length !== originalLength) {
    await wishlist.save();
  }

  return {
    success: true,
    message: "Removed from wishlist.",
    count: wishlist.items.length,
    inWishlist: false
  };
};

const getWishlistCount = async (userId) => {
  const wishlist = await Wishlist.findOne({ user: userId });
  return wishlist ? wishlist.items.length : 0;
};

const isInWishlist = async (userId, productId, variantId) => {
  const wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) return false;

  return wishlist.items.some(
    (item) =>
      String(item.product) === String(productId) &&
      String(item.variantId) === String(variantId)
  );
};

const removeItemForCart = async (userId, productId, variantId) => {
  await Wishlist.updateOne(
    { user: userId },
    { $pull: { items: { product: productId, variantId: variantId } } }
  );
};

export {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  getWishlistCount,
  isInWishlist,
  removeItemForCart
};
