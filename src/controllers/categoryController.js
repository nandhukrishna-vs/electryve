import * as categoryService from "../services/categoryService.js";

const loadCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search?.trim() || "";

    const result = await categoryService.getCategories({
      page,
      search
    });

    res.render("admin/categories/list", {
      layout: "layouts/admin-layout",
      ...result
    });

  } catch (error) {
    console.error("Load Categories Error:", error);
    req.session.errorMessage = "Failed to load categories";
    res.redirect("/admin/dashboard");
  }
};

const loadAddCategory = (req, res) => {
  res.render("admin/categories/add", {
    layout: "layouts/admin-layout",
    message: null,
    errors: {},
    category: {}
  });
};

const addCategory = async (req, res) => {
  try {
    const result = await categoryService.createCategory({
      body: req.body
    });

    if (!result.success) {
      return res.render("admin/categories/add", {
        layout: "layouts/admin-layout",
        errors: result.errors || {},
        message: result.message,
        category: req.body
      });
    }

    req.session.successMessage = result.message;
    res.redirect("/admin/categories");

  } catch (error) {
    console.error("Add Category Error:", error);
    req.session.errorMessage = "Failed to add category";
    res.redirect("/admin/categories/add");
  }
};

const loadEditCategory = async (req, res) => {
  try {
    const category = await categoryService.getCategoryById(req.params.id);

    if (!category) {
      req.session.errorMessage = "Category not found";
      return res.redirect("/admin/categories");
    }

    res.render("admin/categories/edit", {
      layout: "layouts/admin-layout",
      category,
      message: null,
      errors: {}
    });

  } catch (error) {
    console.error("Load Edit Category Error:", error);
    res.redirect("/admin/categories");
  }
};

const editCategory = async (req, res) => {
  try {
    const result = await categoryService.updateCategory({
      id: req.params.id,
      body: req.body
    });

    if (!result.success) {
      return res.render("admin/categories/edit", {
        layout: "layouts/admin-layout",
        errors: result.errors || {},
        message: result.message,
        category: {
          ...req.body,
          _id: req.params.id
        }
      });
    }

    req.session.successMessage = result.message;
    res.redirect("/admin/categories");

  } catch (error) {
    console.error("Edit Category Error:", error);
    res.redirect("/admin/categories");
  }
};

const toggleCategoryStatus = async (req, res) => {
  try {
    const result = await categoryService.toggleCategoryStatus(req.params.id);

    return res.json(result);

  } catch (error) {
    console.error("Toggle Category Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update category"
    });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const result = await categoryService.deleteCategory(req.params.id);

    return res.json(result);

  } catch (error) {
    console.error("Delete Category Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete category"
    });
  }
};

export {
  loadCategories,
  loadAddCategory,
  addCategory,
  loadEditCategory,
  editCategory,
  toggleCategoryStatus,
  deleteCategory
};