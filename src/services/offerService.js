import mongoose from "mongoose";
import Offer from "../models/Offer.js";
import User from "../models/User.js";
import { validateOffer } from "../validators/offerValidator.js";

/**
 * Calculate monetary discount per unit for a given offer and base unit selling price.
 *
 * @param {Object} offer - Offer document or candidate object
 * @param {number} unitPrice - Base selling price of a single unit
 * @returns {number} Actual monetary discount in rupees for one unit
 */
export const calculateUnitOfferDiscount = (offer, unitPrice) => {
  if (!offer || typeof unitPrice !== "number" || unitPrice <= 0) {
    return 0;
  }

  let rawDiscount = 0;

  if (offer.discountType === "PERCENTAGE") {
    rawDiscount = Math.round((unitPrice * Number(offer.discountValue)) / 100);
  } else if (offer.discountType === "FIXED") {
    rawDiscount = Number(offer.discountValue) || 0;
  }

  // Apply maximum discount amount cap if configured
  if (offer.maxDiscountAmount !== null && offer.maxDiscountAmount !== undefined && Number(offer.maxDiscountAmount) > 0) {
    rawDiscount = Math.min(rawDiscount, Number(offer.maxDiscountAmount));
  }

  // Discount cannot exceed the unit price (effective price cannot become negative)
  return Math.min(unitPrice, Math.max(0, rawDiscount));
};

/**
 * Deterministic comparator for candidate offers:
 * 1. Higher monetary discount wins
 * 2. Higher explicit priority wins
 * 3. Newer createdAt wins
 * 4. Deterministic _id string comparison
 */
const compareCandidates = (a, b) => {
  // Monetary discount comparison (primary)
  if (b.monetaryDiscount !== a.monetaryDiscount) {
    return b.monetaryDiscount - a.monetaryDiscount;
  }

  // Priority tie-breaker
  const priorityA = Number(a.offer.priority) || 0;
  const priorityB = Number(b.offer.priority) || 0;
  if (priorityB !== priorityA) {
    return priorityB - priorityA;
  }

  // CreatedAt tie-breaker (newer first)
  const timeA = a.offer.createdAt ? new Date(a.offer.createdAt).getTime() : 0;
  const timeB = b.offer.createdAt ? new Date(b.offer.createdAt).getTime() : 0;
  if (timeB !== timeA) {
    return timeB - timeA;
  }

  // Deterministic _id string comparison
  const idA = String(a.offer._id || "");
  const idB = String(b.offer._id || "");
  return idB.localeCompare(idA);
};

/**
 * Evaluates the single best applicable offer for an individual item.
 * Never stacks Product and Category offers on the same item.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.productId
 * @param {string|ObjectId} params.categoryId
 * @param {number} params.unitPrice - Authoritative unit selling price
 * @param {number} [params.quantity=1] - Quantity purchased
 * @param {string|ObjectId} [params.userId=null]
 * @param {string} [params.referralCode=null]
 * @param {Date} [params.now=new Date()]
 * @param {Array<Object>} [params.prefetchedOffers=null] - Optional cache of active offers to prevent DB roundtrips
 * @returns {Promise<Object>} Best offer details and calculated financial snapshots
 */
export const getBestOfferForItem = async ({
  productId,
  categoryId,
  unitPrice,
  quantity = 1,
  userId = null,
  referralCode = null,
  now = new Date(),
  prefetchedOffers = null
}) => {
  const numericQty = Math.max(1, parseInt(quantity, 10) || 1);
  const numericPrice = typeof unitPrice === "number" && unitPrice > 0 ? unitPrice : 0;

  if (numericPrice <= 0 || !productId) {
    return {
      bestOffer: null,
      unitOfferDiscount: 0,
      totalOfferDiscount: 0,
      effectiveItemPrice: numericPrice,
      itemTotal: numericPrice * numericQty
    };
  }

  const pIdStr = productId.toString();
  const cIdStr = categoryId ? categoryId.toString() : null;

  // Retrieve active offers if not prefetched
  let candidateOffers = prefetchedOffers;
  if (!candidateOffers) {
    const query = {
      isDeleted: false,
      isActive: true,
      startAt: { $lte: now },
      expiryAt: { $gte: now },
      $or: [
        { scope: "PRODUCT", products: productId },
        ...(cIdStr ? [{ scope: "CATEGORY", categories: categoryId }] : []),
        ...(referralCode ? [{ scope: "REFERRAL" }] : [])
      ]
    };

    candidateOffers = await Offer.find(query).lean();
  }

  // Filter candidates relevant to this specific item
  const validCandidates = [];

  for (const offer of candidateOffers) {
    // Basic lifecycle sanity check
    if (offer.isDeleted || !offer.isActive) continue;
    if (now < new Date(offer.startAt) || now > new Date(offer.expiryAt)) continue;

    // Global usage limit check
    if (offer.usageLimit && offer.usedCount >= offer.usageLimit) continue;

    // Scope targeting check
    let isMatch = false;

    if (offer.scope === "PRODUCT") {
      const productIds = Array.isArray(offer.products)
        ? offer.products.map((p) => (p._id ? p._id.toString() : p.toString()))
        : [];
      if (productIds.includes(pIdStr)) {
        isMatch = true;
      }
    } else if (offer.scope === "CATEGORY" && cIdStr) {
      const categoryIds = Array.isArray(offer.categories)
        ? offer.categories.map((c) => (c._id ? c._id.toString() : c.toString()))
        : [];
      if (categoryIds.includes(cIdStr)) {
        isMatch = true;
      }
    } else if (offer.scope === "REFERRAL" && referralCode) {
      if (!offer.referralCode || offer.referralCode.toUpperCase() === referralCode.trim().toUpperCase()) {
        const refVal = await validateReferralCode(referralCode, userId);
        if (refVal.isValid) {
          isMatch = true;
        }
      }
    }

    if (!isMatch) continue;

    const unitDisc = calculateUnitOfferDiscount(offer, numericPrice);
    if (unitDisc > 0) {
      validCandidates.push({
        offer,
        monetaryDiscount: unitDisc
      });
    }
  }

  if (validCandidates.length === 0) {
    return {
      bestOffer: null,
      unitOfferDiscount: 0,
      totalOfferDiscount: 0,
      effectiveItemPrice: numericPrice,
      itemTotal: numericPrice * numericQty
    };
  }

  // Sort candidates deterministically to find the single best offer
  validCandidates.sort(compareCandidates);
  const winner = validCandidates[0];

  const winningUnitDiscount = winner.monetaryDiscount;
  const winningLineDiscount = winningUnitDiscount * numericQty;
  const effectivePrice = Math.max(0, numericPrice - winningUnitDiscount);
  const lineItemTotal = effectivePrice * numericQty;

  return {
    bestOffer: {
      _id: winner.offer._id,
      offerId: winner.offer._id,
      name: winner.offer.name,
      offerName: winner.offer.name,
      scope: winner.offer.scope,
      discountType: winner.offer.discountType,
      discountValue: winner.offer.discountValue,
      priority: winner.offer.priority || 0,
      unitDiscount: winningUnitDiscount,
      totalDiscount: winningLineDiscount
    },
    unitOfferDiscount: winningUnitDiscount,
    unitDiscount: winningUnitDiscount,
    totalOfferDiscount: winningLineDiscount,
    effectiveItemPrice: effectivePrice,
    itemTotal: lineItemTotal
  };
};

/**
 * Batch-evaluate best offers for an array of products and categories (e.g. Shop listing).
 * Runs exactly ONE query for active offers across the catalog batch to prevent N+1 issues.
 *
 * @param {Array<Object>} products - Products list with variants and populated categories
 * @param {Date} [now=new Date()]
 * @returns {Promise<Map<string, Object>>} Map of productId -> best offer info for default variant
 */
export const getOffersForCatalog = async (products, now = new Date()) => {
  const offerMap = new Map();
  if (!Array.isArray(products) || products.length === 0) {
    return offerMap;
  }

  const productIds = [];
  const categoryIds = [];

  for (const p of products) {
    if (!p || !p._id) continue;
    productIds.push(p._id);
    const catId = p.category?._id || p.category;
    if (catId) categoryIds.push(catId);
  }

  // Fetch all active, non-expired offers matching any product or category in the batch
  const activeOffers = await Offer.find({
    isDeleted: false,
    isActive: true,
    startAt: { $lte: now },
    expiryAt: { $gte: now },
    $or: [
      { scope: "PRODUCT", products: { $in: productIds } },
      { scope: "CATEGORY", categories: { $in: categoryIds } }
    ]
  }).lean();

  for (const p of products) {
    if (!p || !p._id) continue;
    const catId = p.category?._id || p.category;
    const defaultVariant = Array.isArray(p.variants)
      ? p.variants.find((v) => v && v.isListed) || p.variants[0]
      : null;

    const unitPrice = defaultVariant?.salePrice || defaultVariant?.regularPrice || 0;

    const evaluation = await getBestOfferForItem({
      productId: p._id,
      categoryId: catId,
      unitPrice,
      quantity: 1,
      now,
      prefetchedOffers: activeOffers
    });

    offerMap.set(p._id.toString(), evaluation);
  }

  return offerMap;
};

/**
 * Atomically consumes usage for an offer if a global limit is configured.
 *
 * @param {string|ObjectId} offerId
 * @param {ClientSession} [session=null]
 * @returns {Promise<boolean>} True if usage was consumed or no limit was configured; False if exhausted.
 */
export const consumeOfferUsage = async (offerId, session = null) => {
  if (!offerId || !mongoose.Types.ObjectId.isValid(offerId)) {
    return true;
  }

  const opts = session ? { session } : {};
  const filter = {
    _id: offerId,
    isDeleted: false,
    isActive: true,
    $or: [
      { usageLimit: null },
      { usageLimit: { $exists: false } },
      { $expr: { $lt: ["$usedCount", "$usageLimit"] } }
    ]
  };

  const res = await Offer.updateOne(filter, { $inc: { usedCount: 1 } }, opts);
  return res.modifiedCount === 1;
};

/**
 * Idempotently rollback consumed offer usage upon transaction failure.
 */
export const rollbackOfferUsage = async (offerId, session = null) => {
  if (!offerId || !mongoose.Types.ObjectId.isValid(offerId)) {
    return;
  }
  const opts = session ? { session } : {};
  await Offer.updateOne(
    { _id: offerId, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } },
    opts
  ).catch((err) => console.error("Rollback offer usage warning:", err.message));
};

/**
 * Validates a referral code server-side:
 * - Checks code existence and format
 * - Prevents self-referral
 * - Ensures referrer account is active
 *
 * @param {string} referralCode
 * @param {string|ObjectId} [currentUserId=null]
 * @returns {Promise<Object>} { isValid, message, referrer }
 */
export const validateReferralCode = async (referralCode, currentUserId = null) => {
  if (!referralCode || !referralCode.trim()) {
    return { isValid: false, message: "Referral code is required." };
  }

  const normalizedCode = referralCode.trim().toUpperCase();

  const referrer = await User.findOne({
    referralCode: normalizedCode,
    status: "ACTIVE"
  });

  if (!referrer) {
    return { isValid: false, message: "Invalid or inactive referral code." };
  }

  if (currentUserId && referrer._id.toString() === currentUserId.toString()) {
    return { isValid: false, message: "You cannot use your own referral code." };
  }

  return { isValid: true, message: "Referral code verified successfully.", referrer };
};

/* ===================================================
   ADMIN CRUD OPERATIONS
   =================================================== */

/**
 * Retrieve paginated list of offers with search, scope, and status filtering.
 */
export const getOffers = async ({ page = 1, limit = 10, search = "", scope = "", status = "" } = {}) => {
  const filter = { isDeleted: false };

  if (search && search.trim()) {
    filter.name = {
      $regex: search.trim(),
      $options: "i"
    };
  }

  if (scope && ["PRODUCT", "CATEGORY", "REFERRAL"].includes(scope.toUpperCase())) {
    filter.scope = scope.toUpperCase();
  }

  const now = new Date();
  if (status) {
    const s = status.toUpperCase();
    if (s === "ACTIVE") {
      filter.isActive = true;
      filter.startAt = { $lte: now };
      filter.expiryAt = { $gte: now };
    } else if (s === "SCHEDULED") {
      filter.isActive = true;
      filter.startAt = { $gt: now };
    } else if (s === "EXPIRED") {
      filter.expiryAt = { $lt: now };
    } else if (s === "INACTIVE") {
      filter.isActive = false;
    }
  }

  const parsedLimit = Math.max(1, parseInt(limit, 10) || 10);
  const totalOffers = await Offer.countDocuments(filter);
  const totalPages = Math.ceil(totalOffers / parsedLimit) || 1;
  const currentPage = Math.max(1, Math.min(parseInt(page, 10) || 1, totalPages));
  const skip = (currentPage - 1) * parsedLimit;

  const offers = await Offer.find(filter)
    .populate("products", "name")
    .populate("categories", "name")
    .sort({ priority: -1, createdAt: -1 })
    .skip(skip)
    .limit(parsedLimit);

  return {
    offers,
    totalOffers,
    totalPages,
    currentPage,
    limit: parsedLimit,
    search: search.trim(),
    scope: scope.toUpperCase(),
    status: status.toUpperCase()
  };
};

/**
 * Retrieve single offer by its ID.
 */
export const getOfferById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }
  return await Offer.findOne({ _id: id, isDeleted: false })
    .populate("products", "name")
    .populate("categories", "name");
};

/**
 * Create a new offer.
 */
export const createOffer = async (data) => {
  const validation = validateOffer(data);

  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors,
      message: "Validation failed. Please check the form fields."
    };
  }

  try {
    const offer = new Offer(validation.value);
    await offer.save();

    return {
      success: true,
      message: "Offer created successfully.",
      offer
    };
  } catch (error) {
    console.error("Create Offer Service Error:", error);
    throw error;
  }
};

/**
 * Update an existing offer.
 */
export const updateOffer = async (id, data) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { success: false, message: "Invalid offer ID." };
  }

  const offer = await Offer.findOne({ _id: id, isDeleted: false });
  if (!offer) {
    return { success: false, message: "Offer not found or has been deleted." };
  }

  const validation = validateOffer(data);
  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors,
      message: "Validation failed. Please check the form fields."
    };
  }

  try {
    offer.name = validation.value.name;
    offer.description = validation.value.description;
    offer.discountType = validation.value.discountType;
    offer.discountValue = validation.value.discountValue;
    offer.scope = validation.value.scope;
    offer.products = validation.value.products || [];
    offer.categories = validation.value.categories || [];
    offer.referralCode = validation.value.referralCode || null;
    offer.startAt = validation.value.startAt;
    offer.expiryAt = validation.value.expiryAt;
    offer.priority = validation.value.priority || 0;
    offer.maxDiscountAmount = validation.value.maxDiscountAmount;
    offer.usageLimit = validation.value.usageLimit;
    offer.perUserLimit = validation.value.perUserLimit;
    offer.isActive = validation.value.isActive;

    await offer.save();

    return {
      success: true,
      message: "Offer updated successfully.",
      offer
    };
  } catch (error) {
    console.error("Update Offer Service Error:", error);
    throw error;
  }
};

/**
 * Toggle offer active status.
 */
export const toggleOfferStatus = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { success: false, message: "Invalid offer ID." };
  }

  const offer = await Offer.findOne({ _id: id, isDeleted: false });
  if (!offer) {
    return { success: false, message: "Offer not found." };
  }

  offer.isActive = !offer.isActive;
  await offer.save();

  return {
    success: true,
    message: offer.isActive ? "Offer activated successfully." : "Offer deactivated successfully.",
    isActive: offer.isActive,
    displayStatus: offer.displayStatus
  };
};

/**
 * Soft delete an offer.
 */
export const deleteOffer = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { success: false, message: "Invalid offer ID." };
  }

  const offer = await Offer.findOne({ _id: id, isDeleted: false });
  if (!offer) {
    return { success: false, message: "Offer not found or already deleted." };
  }

  offer.isDeleted = true;
  offer.isActive = false;
  await offer.save();

  return {
    success: true,
    message: "Offer deleted successfully."
  };
};
