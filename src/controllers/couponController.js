import * as couponService from "../services/couponService.js";

/**
 * Render admin coupons list view with pagination and search
 */
export const loadCoupons = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const search = req.query.search?.trim() || "";

    const result = await couponService.getCoupons({
      page,
      search,
      limit: 10
    });

    const successMessage = req.session.successMessage || null;
    const errorMessage = req.session.errorMessage || null;
    delete req.session.successMessage;
    delete req.session.errorMessage;

    res.render("admin/coupons/list", {
      layout: "layouts/admin-layout",
      ...result,
      successMessage,
      errorMessage
    });
  } catch (error) {
    console.error("Load Coupons Error:", error);
    req.session.errorMessage = "Failed to load coupons.";
    res.redirect("/admin/dashboard");
  }
};

/**
 * Render Add Coupon form view
 */
export const loadAddCoupon = (req, res) => {
  res.render("admin/coupons/add", {
    layout: "layouts/admin-layout",
    coupon: {},
    errors: {},
    errorMessage: null
  });
};

/**
 * Handle Add Coupon form submission
 */
export const createCoupon = async (req, res) => {
  try {
    const result = await couponService.createCoupon(req.body);

    if (!result.success) {
      return res.render("admin/coupons/add", {
        layout: "layouts/admin-layout",
        coupon: req.body,
        errors: result.errors || {},
        errorMessage: result.message
      });
    }

    req.session.successMessage = result.message;
    res.redirect("/admin/coupons");
  } catch (error) {
    console.error("Create Coupon Controller Error:", error);
    res.render("admin/coupons/add", {
      layout: "layouts/admin-layout",
      coupon: req.body,
      errors: {},
      errorMessage: "An unexpected error occurred while creating the coupon."
    });
  }
};

/**
 * Render Edit Coupon form view
 */
export const loadEditCoupon = async (req, res) => {
  try {
    const coupon = await couponService.getCouponById(req.params.id);

    if (!coupon) {
      req.session.errorMessage = "Coupon not found.";
      return res.redirect("/admin/coupons");
    }

    // Format dates to YYYY-MM-DD for HTML date inputs
    const formattedCoupon = coupon.toObject();
    if (formattedCoupon.startDate) {
      formattedCoupon.startDate = new Date(formattedCoupon.startDate).toISOString().split("T")[0];
    }
    if (formattedCoupon.expiryDate) {
      formattedCoupon.expiryDate = new Date(formattedCoupon.expiryDate).toISOString().split("T")[0];
    }

    res.render("admin/coupons/edit", {
      layout: "layouts/admin-layout",
      coupon: formattedCoupon,
      errors: {},
      errorMessage: null
    });
  } catch (error) {
    console.error("Load Edit Coupon Error:", error);
    req.session.errorMessage = "Failed to load coupon details.";
    res.redirect("/admin/coupons");
  }
};

/**
 * Handle Edit Coupon form submission
 */
export const updateCoupon = async (req, res) => {
  try {
    const result = await couponService.updateCoupon(req.params.id, req.body);

    if (!result.success) {
      return res.render("admin/coupons/edit", {
        layout: "layouts/admin-layout",
        coupon: {
          ...req.body,
          _id: req.params.id
        },
        errors: result.errors || {},
        errorMessage: result.message
      });
    }

    req.session.successMessage = result.message;
    res.redirect("/admin/coupons");
  } catch (error) {
    console.error("Update Coupon Controller Error:", error);
    res.render("admin/coupons/edit", {
      layout: "layouts/admin-layout",
      coupon: {
        ...req.body,
        _id: req.params.id
      },
      errors: {},
      errorMessage: "An unexpected error occurred while updating the coupon."
    });
  }
};

/**
 * Handle AJAX Coupon Status Toggle
 */
export const toggleCouponStatus = async (req, res) => {
  try {
    const result = await couponService.toggleCouponStatus(req.params.id);
    return res.json(result);
  } catch (error) {
    console.error("Toggle Coupon Controller Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update coupon status."
    });
  }
};

/**
 * Handle AJAX Coupon Soft Deletion
 */
export const deleteCoupon = async (req, res) => {
  try {
    const result = await couponService.deleteCoupon(req.params.id);
    return res.json(result);
  } catch (error) {
    console.error("Delete Coupon Controller Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete coupon."
    });
  }
};
