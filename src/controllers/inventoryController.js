import * as inventoryService from "../services/inventoryService.js";

/**
 * Render the Admin Inventory / Stock Management listing page.
 */
const loadInventory = async (req, res, next) => {
  try {
    const { search, status, page } = req.query;

    const data = await inventoryService.getInventory({
      search,
      status,
      page,
      limit: 10
    });

    res.render("admin/inventory/list", {
      layout: "layouts/admin-layout",
      title: "Inventory Management",
      ...data,
      query: req.query
    });
  } catch (error) {
    console.error("Admin Load Inventory Error:", error);
    next(error);
  }
};

/**
 * Update stock for a specific product variant via AJAX PATCH request.
 */
const updateStock = async (req, res, next) => {
  try {
    const { productId, variantId } = req.params;
    const { stock } = req.body;

    if (stock === undefined || stock === null || stock === "") {
      return res.status(400).json({
        success: false,
        message: "Stock quantity is required."
      });
    }

    const result = await inventoryService.updateVariantStock(productId, variantId, stock);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("Admin Update Stock Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred while updating stock."
    });
  }
};

export {
  loadInventory,
  updateStock
};
