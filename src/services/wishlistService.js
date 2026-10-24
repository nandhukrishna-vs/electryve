import mongoose from "mongoose";
import Wishlist from "../models/Wishlist.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Brand from "../models/Brand.js";

const getWishlist = async (userId) => {
  const wishlist = await Wishlist.findOne({ user: userId }).populate({
    path: "items.product",
    populate: [{ path: "category" }, { path: "brand" }]
  });

  if (!wishlist) {
    return [];
  }

  // Deduplicate items in case historical duplicates exist in database
  const seenKeys = new Set();
  const uniqueItems = [];
  for (const item of wishlist.items || []) {
    const pId = String(item.product?._id || item.product);
    const vId = String(item.variantId);
    const key = `${pId}_${vId}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueItems.push(item);
    }
  }

  const processedItems = uniqueItems.map((item) => {
    const product = item.product;
    let isAvailable = true;
    let unavailabilityReason = "";

    // 1. Check Product exists and is active/listed
    if (!product || product.isDeleted || !product.isListed) {
      isAvailable = false;
      unavailabilityReason = "This product is no longer available.";
    }

    // 2. Check Category is active/listed
    if (
      isAvailable &&
      (!product.category || product.category.isDeleted || !product.category.isListed)
    ) {
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
      variant = product.variants.find((v) => String(v._id) === String(item.variantId));

      if (!variant || !variant.isListed) {
        isAvailable = false;
        unavailabilityReason = "This product is no longer available.";
      }
    }

    let discountPercentage = 0;
    if (variant && variant.regularPrice > 0 && variant.salePrice < variant.regularPrice) {
      const rawPercent = ((variant.regularPrice - variant.salePrice) / variant.regularPrice) * 100;
      discountPercentage = Math.round(rawPercent);
      if (discountPercentage >= 100 && variant.salePrice > 0) {
        discountPercentage = 99;
      }
    }

    return {
      productId: product?._id || item.product,
      variantId: item.variantId,
      addedAt: item.addedAt,
      product: product
        ? {
            name: product.name,
            category: product.category?.name,
            brand: product.brand?.name
          }
        : null,
      variant: variant
        ? {
            color: variant.color,
            storage: variant.storage,
            sku: variant.sku,
            regularPrice: variant.regularPrice,
            salePrice: variant.salePrice,
            discountPercentage,
            stock: variant.stock,
            images: variant.images
          }
        : null,
      isAvailable,
      unavailabilityReason
    };
  });

  return processedItems;
};

const addToWishlist = async (userId, productId, variantId) => {
  if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(variantId)) {
    return { success: false, message: "Invalid product or variant ID format." };
  }

  // Validate Product exists and is active/listed
  const product = await Product.findById(productId).populate("category").populate("brand");

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
  const variant = product.variants.find((v) => String(v._id) === String(variantId));

  if (!variant || !variant.isListed) {
    return { success: false, message: "This product is no longer available." };
  }

  // Ensure Wishlist document exists for the user (absorb E11000 if parallel requests race on first-time insert)
  try {
    await Wishlist.updateOne(
      { user: userId },
      { $setOnInsert: { user: userId, items: [] } },
      { upsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) {
      throw err;
    }
  }

  // Check if item already exists in user's wishlist
  const existing = await Wishlist.findOne({
    user: userId,
    items: {
      $elemMatch: {
        product: productId,
        variantId: variantId
      }
    }
  });

  if (existing) {
    return {
      success: true,
      message: "Product is already in your wishlist.",
      count: existing.items.length,
      inWishlist: true,
      alreadyExists: true
    };
  }

  // Atomically push item only if not matching elemMatch (concurrency-safe against race conditions)
  const updatedWishlist = await Wishlist.findOneAndUpdate(
    {
      user: userId,
      items: {
        $not: {
          $elemMatch: {
            product: productId,
            variantId: variantId
          }
        }
      }
    },
    {
      $push: {
        items: {
          product: productId,
          variantId: variantId,
          addedAt: new Date()
        }
      }
    },
    { returnDocument: "after" }
  );

  if (!updatedWishlist) {
    // A concurrent request added the item in between
    const current = await Wishlist.findOne({ user: userId });
    return {
      success: true,
      message: "Product is already in your wishlist.",
      count: current ? current.items.length : 0,
      inWishlist: true,
      alreadyExists: true
    };
  }

  return {
    success: true,
    message: "Added to wishlist.",
    count: updatedWishlist.items.length,
    inWishlist: true,
    alreadyExists: false
  };
};

const removeFromWishlist = async (userId, productId, variantId) => {
  if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(variantId)) {
    return { success: false, message: "Invalid product or variant ID format." };
  }

  const updatedWishlist = await Wishlist.findOneAndUpdate(
    { user: userId },
    {
      $pull: {
        items: {
          product: productId,
          variantId: variantId
        }
      }
    },
    { returnDocument: "after" }
  );

  return {
    success: true,
    message: "Removed from wishlist.",
    count: updatedWishlist ? updatedWishlist.items.length : 0,
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
      String(item.product) === String(productId) && String(item.variantId) === String(variantId)
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
