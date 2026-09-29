import mongoose from "mongoose";
import Category from "../models/Category.js";
import Brand from "../models/Brand.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import Banner from "../models/Banner.js";
import Wishlist from "../models/Wishlist.js";
import ReferralProgram from "../models/ReferralProgram.js";
import { getOffersForCatalog } from "./offerService.js";

/**
 * Maps category names or slugs to contextual Bootstrap Icon names.
 */
export const getCategoryIcon = (categoryName = "") => {
  const norm = String(categoryName).toLowerCase().trim();
  if (norm.includes("phone") || norm.includes("mobile") || norm.includes("iphone") || norm.includes("smartphone")) {
    return "bi-phone";
  }
  if (norm.includes("laptop") || norm.includes("macbook") || norm.includes("computer") || norm.includes("pc")) {
    return "bi-laptop";
  }
  if (norm.includes("earbud") || norm.includes("headphone") || norm.includes("audio") || norm.includes("sound")) {
    return "bi-headphones";
  }
  if (norm.includes("game") || norm.includes("ps5") || norm.includes("console") || norm.includes("playstation") || norm.includes("xbox")) {
    return "bi-controller";
  }
  if (norm.includes("watch") || norm.includes("wearable")) {
    return "bi-smartwatch";
  }
  if (norm.includes("accessory") || norm.includes("accessories") || norm.includes("cable") || norm.includes("charger")) {
    return "bi-plugin";
  }
  return "bi-grid";
};

/**
 * Enriches an array of raw product documents with default variant, pricing,
 * stock status, wishlist status, and authoritative offer calculations.
 *
 * NOTE: getOffersForCatalog() contract is strictly preserved (returns a Map).
 */
export const enrichProductsForStorefront = async (rawProducts = [], userId = null) => {
  if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
    return [];
  }

  // 1. Authoritative batch offer calculation (returns Map)
  const catalogOffers = await getOffersForCatalog(rawProducts);

  // 2. Read user's wishlist if logged in
  let wishlistVariantIds = [];
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    try {
      const wishlist = await Wishlist.findOne({ user: userId }).lean();
      if (wishlist && Array.isArray(wishlist.items)) {
        wishlistVariantIds = wishlist.items.map(item => String(item.variantId));
      }
    } catch (err) {
      console.error("[Home Service] Error reading wishlist for storefront:", err);
    }
  }

  // 3. Map products to storefront card presentation format
  return rawProducts.map(p => {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const defaultVariant = variants.find(v => v.isListed) || variants[0] || null;

    let discountPercentage = 0;
    let stockStatus = "Out of Stock";

    const offerData = catalogOffers.get(p._id.toString());
    const bestOffer = offerData?.bestOffer || null;
    const unitOfferDiscount = offerData?.unitOfferDiscount || 0;
    const effectivePrice = offerData?.effectiveItemPrice ?? (defaultVariant?.salePrice || 0);

    if (defaultVariant) {
      const regPrice = defaultVariant.regularPrice || 0;
      const finalPrice = effectivePrice;
      if (regPrice > 0 && finalPrice < regPrice) {
        discountPercentage = Math.round(((regPrice - finalPrice) / regPrice) * 100);
      }

      if (defaultVariant.stock <= 0) {
        stockStatus = "Out of Stock";
      } else if (defaultVariant.stock <= 5) {
        stockStatus = "Low Stock";
      } else {
        stockStatus = "In Stock";
      }
    }

    const isInWishlist = (defaultVariant && defaultVariant._id)
      ? wishlistVariantIds.includes(String(defaultVariant._id))
      : false;

    // Pick first image or fallback
    let primaryImage = null;
    if (defaultVariant && Array.isArray(defaultVariant.images) && defaultVariant.images.length > 0) {
      primaryImage = defaultVariant.images[0];
    } else {
      for (const v of variants) {
        if (Array.isArray(v.images) && v.images.length > 0) {
          primaryImage = v.images[0];
          break;
        }
      }
    }

    return {
      ...p,
      defaultVariant,
      primaryImage,
      bestOffer,
      unitOfferDiscount,
      effectivePrice,
      discountPercentage,
      stockStatus,
      isInWishlist
    };
  });
};

/**
 * Retrieves dynamic active categories with product counts and visual icons.
 */
export const getStorefrontCategories = async () => {
  const categories = await Category.find({
    isListed: true,
    isDeleted: false
  })
    .sort({ name: 1 })
    .lean();

  if (categories.length === 0) {
    return [];
  }

  // Count active listed products per category
  const categoryIds = categories.map(c => c._id);
  const productCounts = await Product.aggregate([
    {
      $match: {
        category: { $in: categoryIds },
        isListed: true,
        isDeleted: false,
        "variants.0": { $exists: true }
      }
    },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 }
      }
    }
  ]);

  const countMap = new Map(productCounts.map(item => [item._id.toString(), item.count]));

  return categories.map(cat => ({
    ...cat,
    productCount: countMap.get(cat._id.toString()) || 0,
    icon: getCategoryIcon(cat.name)
  }));
};

/**
 * Retrieves active promotional banners for homepage carousel.
 * Seeds initial high-quality default banners if collection is empty.
 */
export const getStorefrontBanners = async () => {
  const now = new Date();
  let banners = await Banner.find({
    isActive: true,
    $and: [
      { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
      { $or: [{ expiryAt: null }, { expiryAt: { $gte: now } }] }
    ]
  })
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean();

  if (banners.length === 0) {
    const totalCount = await Banner.countDocuments();
    if (totalCount === 0) {
      // Seed default promotional slides matching Electryve's catalog
      const defaultBanners = [
        {
          title: "Upgrade Your Setup",
          subtitle: "Powerful laptops engineered for maximum performance, creativity, and speed.",
          badge: "Premium Computing",
          image: "https://electryve-assets-nandhukrishna.s3.ap-south-1.amazonaws.com/products/1786090521553-80384949-1e6e-45f9-b64a-b615d88326e3.jfif",
          ctaText: "Explore Laptops",
          ctaLink: "/shop?category=laptops",
          displayOrder: 1,
          isActive: true
        },
        {
          title: "Next-Level Gaming",
          subtitle: "Stunning graphics, lightning-fast load times, and deeper gaming immersion.",
          badge: "Next-Gen Console",
          image: "https://electryve-assets-nandhukrishna.s3.ap-south-1.amazonaws.com/products/1787280803678-a978cef2-3e14-4bc8-8283-acf9817c7d11.jfif",
          ctaText: "Shop Gaming",
          ctaLink: "/shop?category=ps5",
          displayOrder: 2,
          isActive: true
        },
        {
          title: "Smart Tech, Smarter Prices",
          subtitle: "Discover flagship smartphones and studio-quality wireless audio at unbeatable values.",
          badge: "Flagship Electronics",
          image: "https://electryve-assets-nandhukrishna.s3.ap-south-1.amazonaws.com/products/1785485494977-e383f285-1e65-4aa3-ae61-da481697196f.jfif",
          ctaText: "Explore Phones",
          ctaLink: "/shop?category=Phones",
          displayOrder: 3,
          isActive: true
        }
      ];

      try {
        await Banner.insertMany(defaultBanners);
        banners = await Banner.find({ isActive: true }).sort({ displayOrder: 1 }).lean();
      } catch (seedErr) {
        console.error("[Home Service] Error seeding default banners:", seedErr);
        banners = defaultBanners;
      }
    }
  }

  return banners;
};

/**
 * Retrieves best-selling products derived authoritatively from valid completed orders.
 */
export const getBestSellingProducts = async (limit = 8, userId = null) => {
  const bestSellerAgg = await Order.aggregate([
    {
      $match: {
        $or: [
          {
            paymentMethod: { $in: ["RAZORPAY", "WALLET"] },
            paymentStatus: { $in: ["COMPLETED", "PAID"] }
          },
          {
            paymentMethod: "COD",
            $or: [
              { orderStatus: { $ne: "CANCELLED" } },
              { paymentStatus: "COMPLETED" }
            ]
          }
        ]
      }
    },
    { $unwind: "$items" },
    {
      $match: {
        "items.itemStatus": { $nin: ["CANCELLED", "RETURNED"] }
      }
    },
    {
      $group: {
        _id: "$items.product",
        unitsSold: { $sum: "$items.quantity" }
      }
    },
    { $sort: { unitsSold: -1 } },
    { $limit: limit * 2 }
  ]);

  const orderedProductIds = bestSellerAgg.map(item => item._id).filter(Boolean);

  let rawProducts = [];
  if (orderedProductIds.length > 0) {
    const foundProducts = await Product.find({
      _id: { $in: orderedProductIds },
      isListed: true,
      isDeleted: false,
      "variants.0": { $exists: true }
    })
      .populate("category")
      .populate("brand")
      .lean();

    const prodMap = new Map(foundProducts.map(p => [p._id.toString(), p]));
    rawProducts = orderedProductIds
      .map(id => prodMap.get(id.toString()))
      .filter(Boolean);
  }

  // Supplement if order history has fewer than requested products
  if (rawProducts.length < limit) {
    const existingIds = rawProducts.map(p => p._id);
    const supplementProducts = await Product.find({
      _id: { $nin: existingIds },
      isListed: true,
      isDeleted: false,
      "variants.0": { $exists: true }
    })
      .populate("category")
      .populate("brand")
      .sort({ createdAt: -1 })
      .limit(limit - rawProducts.length)
      .lean();

    rawProducts = [...rawProducts, ...supplementProducts];
  }

  return await enrichProductsForStorefront(rawProducts.slice(0, limit), userId);
};

/**
 * Retrieves featured products marked in database.
 */
export const getFeaturedProducts = async (limit = 8, userId = null) => {
  let rawProducts = await Product.find({
    isFeatured: true,
    isListed: true,
    isDeleted: false,
    "variants.0": { $exists: true }
  })
    .populate("category")
    .populate("brand")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  // If no products have been flagged featured, provide top active products
  if (rawProducts.length === 0) {
    rawProducts = await Product.find({
      isListed: true,
      isDeleted: false,
      "variants.0": { $exists: true }
    })
      .populate("category")
      .populate("brand")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  return await enrichProductsForStorefront(rawProducts.slice(0, limit), userId);
};

/**
 * Retrieves new arrivals sorted by creation date descending.
 */
export const getNewArrivals = async (limit = 8, userId = null) => {
  const rawProducts = await Product.find({
    isListed: true,
    isDeleted: false,
    "variants.0": { $exists: true }
  })
    .populate("category")
    .populate("brand")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return await enrichProductsForStorefront(rawProducts, userId);
};

/**
 * Central orchestrator for all homepage data sections.
 */
export const getHomePageData = async ({ userId = null } = {}) => {
  const [
    categories,
    banners,
    featuredProducts,
    bestSellers,
    newArrivals,
    referralProgram
  ] = await Promise.all([
    getStorefrontCategories(),
    getStorefrontBanners(),
    getFeaturedProducts(8, userId),
    getBestSellingProducts(8, userId),
    getNewArrivals(8, userId),
    ReferralProgram.getProgram().catch(() => null)
  ]);

  return {
    categories,
    banners,
    featuredProducts,
    bestSellers,
    newArrivals,
    referralProgram
  };
};

export default {
  getCategoryIcon,
  enrichProductsForStorefront,
  getStorefrontCategories,
  getStorefrontBanners,
  getBestSellingProducts,
  getFeaturedProducts,
  getNewArrivals,
  getHomePageData
};
