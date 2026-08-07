import * as brandService from "../services/brandService.js";

const loadBrands = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search?.trim() || "";

    const result = await brandService.getBrands({
      page,
      search
    });

    res.render("admin/brands/list", {
      layout: "layouts/admin-layout",
      ...result
    });

  } catch (error) {
    console.error("Load Brands Error:", error);
    req.session.errorMessage = "Failed to load brands";
    res.redirect("/admin/dashboard");
  }
};

const loadAddBrand = (req, res) => {
  res.render("admin/brands/add", {
    layout: "layouts/admin-layout",
    message: null,
    errors: {},
    brand: {}
  });
};

const addBrand = async (req, res) => {
  try {
    const result = await brandService.createBrand({
      body: req.body
    });

    if (!result.success) {
      return res.render("admin/brands/add", {
        layout: "layouts/admin-layout",
        errors: result.errors || {},
        message: result.message,
        brand: req.body
      });
    }

    req.session.successMessage = result.message;
    res.redirect("/admin/brands");

  } catch (error) {
    console.error("Add Brand Error:", error);
    req.session.errorMessage = "Failed to add brand";
    res.redirect("/admin/brands/add");
  }
};

const loadEditBrand = async (req, res) => {
  try {
    const brand = await brandService.getBrandById(req.params.id);

    if (!brand) {
      req.session.errorMessage = "Brand not found";
      return res.redirect("/admin/brands");
    }

    res.render("admin/brands/edit", {
      layout: "layouts/admin-layout",
      brand,
      message: null,
      errors: {}
    });

  } catch (error) {
    console.error("Load Edit Brand Error:", error);
    res.redirect("/admin/brands");
  }
};

const editBrand = async (req, res) => {
  try {
    const result = await brandService.updateBrand({
      id: req.params.id,
      body: req.body
    });

    if (!result.success) {
      return res.render("admin/brands/edit", {
        layout: "layouts/admin-layout",
        errors: result.errors || {},
        message: result.message,
        brand: {
          ...req.body,
          _id: req.params.id
        }
      });
    }

    req.session.successMessage = result.message;
    res.redirect("/admin/brands");

  } catch (error) {
    console.error("Edit Brand Error:", error);
    res.redirect("/admin/brands");
  }
};

const toggleBrandStatus = async (req, res) => {
  try {
    const result = await brandService.toggleBrandStatus(req.params.id);

    return res.json(result);

  } catch (error) {
    console.error("Toggle Brand Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update brand"
    });
  }
};

const deleteBrand = async (req, res) => {
  try {
    const result = await brandService.deleteBrand(req.params.id);

    return res.json(result);

  } catch (error) {
    console.error("Delete Brand Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete brand"
    });
  }
};

export {
  loadBrands,
  loadAddBrand,
  addBrand,
  loadEditBrand,
  editBrand,
  toggleBrandStatus,
  deleteBrand
};