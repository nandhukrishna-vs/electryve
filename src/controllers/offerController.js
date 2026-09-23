import * as offerService from "../services/offerService.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";

/**
 * Helper to fetch active products and categories for dropdown selections
 */
const getSelectionData = async () => {
  const [products, categories] = await Promise.all([
    Product.find({ isDeleted: false, isListed: true }).select("name").sort({ name: 1 }).lean(),
    Category.find({ isDeleted: false, isListed: true }).select("name").sort({ name: 1 }).lean()
  ]);
  return { products, categories };
};

/**
 * Format date for datetime-local input (YYYY-MM-DDTHH:mm)
 */
const formatDateForInput = (date) => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/**
 * Render admin offers list view with pagination, search, and filters
 */
export const loadOffers = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const search = req.query.search?.trim() || "";
    const scope = req.query.scope?.trim() || "";
    const status = req.query.status?.trim() || "";

    const result = await offerService.getOffers({
      page,
      search,
      scope,
      status,
      limit: 10
    });

    const successMessage = req.session.successMessage || null;
    const errorMessage = req.session.errorMessage || null;
    delete req.session.successMessage;
    delete req.session.errorMessage;

    res.render("admin/offers/list", {
      layout: "layouts/admin-layout",
      ...result,
      search,
      scope,
      status,
      successMessage,
      errorMessage
    });
  } catch (error) {
    console.error("Load Offers Controller Error:", error);
    req.session.errorMessage = "Failed to load offers.";
    res.redirect("/admin/dashboard");
  }
};

/**
 * Render Add Offer form view
 */
export const loadAddOffer = async (req, res) => {
  try {
    const { products, categories } = await getSelectionData();
    res.render("admin/offers/add", {
      layout: "layouts/admin-layout",
      offer: {},
      products,
      categories,
      errors: {},
      errorMessage: null
    });
  } catch (error) {
    console.error("Load Add Offer Error:", error);
    req.session.errorMessage = "Failed to open add offer form.";
    res.redirect("/admin/offers");
  }
};

/**
 * Handle Add Offer form submission
 */
export const createOffer = async (req, res) => {
  try {
    const result = await offerService.createOffer(req.body);

    if (!result.success) {
      const { products, categories } = await getSelectionData();
      return res.render("admin/offers/add", {
        layout: "layouts/admin-layout",
        offer: req.body,
        products,
        categories,
        errors: result.errors || {},
        errorMessage: result.message
      });
    }

    req.session.successMessage = result.message;
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Create Offer Controller Error:", error);
    const { products, categories } = await getSelectionData().catch(() => ({ products: [], categories: [] }));
    res.render("admin/offers/add", {
      layout: "layouts/admin-layout",
      offer: req.body,
      products,
      categories,
      errors: {},
      errorMessage: "An unexpected error occurred while creating the offer."
    });
  }
};

/**
 * Render Edit Offer form view
 */
export const loadEditOffer = async (req, res) => {
  try {
    const offer = await offerService.getOfferById(req.params.id);

    if (!offer) {
      req.session.errorMessage = "Offer not found.";
      return res.redirect("/admin/offers");
    }

    const { products, categories } = await getSelectionData();
    const formattedOffer = offer.toObject();
    formattedOffer.startAtFormatted = formatDateForInput(formattedOffer.startAt);
    formattedOffer.expiryAtFormatted = formatDateForInput(formattedOffer.expiryAt);

    // Convert target ids to string arrays for easy matching in EJS
    formattedOffer.productIds = (formattedOffer.products || []).map(p => String(p._id || p));
    formattedOffer.categoryIds = (formattedOffer.categories || []).map(c => String(c._id || c));

    res.render("admin/offers/edit", {
      layout: "layouts/admin-layout",
      offer: formattedOffer,
      products,
      categories,
      errors: {},
      errorMessage: null
    });
  } catch (error) {
    console.error("Load Edit Offer Error:", error);
    req.session.errorMessage = "Failed to load offer details.";
    res.redirect("/admin/offers");
  }
};

/**
 * Handle Edit Offer form submission
 */
export const updateOffer = async (req, res) => {
  try {
    const result = await offerService.updateOffer(req.params.id, req.body);

    if (!result.success) {
      const { products, categories } = await getSelectionData();
      const submitted = {
        ...req.body,
        _id: req.params.id,
        startAtFormatted: req.body.startAt ? formatDateForInput(req.body.startAt) : "",
        expiryAtFormatted: req.body.expiryAt ? formatDateForInput(req.body.expiryAt) : "",
        productIds: Array.isArray(req.body.products) ? req.body.products.map(String) : (req.body.products ? [String(req.body.products)] : []),
        categoryIds: Array.isArray(req.body.categories) ? req.body.categories.map(String) : (req.body.categories ? [String(req.body.categories)] : [])
      };
      return res.render("admin/offers/edit", {
        layout: "layouts/admin-layout",
        offer: submitted,
        products,
        categories,
        errors: result.errors || {},
        errorMessage: result.message
      });
    }

    req.session.successMessage = result.message;
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Update Offer Controller Error:", error);
    const { products, categories } = await getSelectionData().catch(() => ({ products: [], categories: [] }));
    res.render("admin/offers/edit", {
      layout: "layouts/admin-layout",
      offer: {
        ...req.body,
        _id: req.params.id
      },
      products,
      categories,
      errors: {},
      errorMessage: "An unexpected error occurred while updating the offer."
    });
  }
};

/**
 * Handle AJAX Offer Status Toggle
 */
export const toggleOfferStatus = async (req, res) => {
  try {
    const result = await offerService.toggleOfferStatus(req.params.id);
    return res.json(result);
  } catch (error) {
    console.error("Toggle Offer Status Controller Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update offer status."
    });
  }
};

/**
 * Handle AJAX Offer Soft Deletion
 */
export const deleteOffer = async (req, res) => {
  try {
    const result = await offerService.deleteOffer(req.params.id);
    return res.json(result);
  } catch (error) {
    console.error("Delete Offer Controller Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete offer."
    });
  }
};
