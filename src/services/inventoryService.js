import mongoose from "mongoose";
import Product from "../models/Product.js";

const LOW_STOCK_THRESHOLD = 5;

/**
 * Fetch paginated inventory list of product variants with search, filters, and summary metrics.
 */
const getInventory = async ({ search = "", status = "", page = 1, limit = 10 } = {}) => {
  const parsedLimit = Math.max(1, parseInt(limit, 10) || 10);
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);

  // Base aggregation pipeline
  const pipeline = [
    { $match: { isDeleted: false } },
    { $unwind: "$variants" },
    {
      $lookup: {
        from: "brands",
        localField: "brand",
        foreignField: "_id",
        as: "brandInfo"
      }
    },
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "categoryInfo"
      }
    },
    {
      $project: {
        productId: "$_id",
        productName: "$name",
        brandName: { $arrayElemAt: ["$brandInfo.name", 0] },
        categoryName: { $arrayElemAt: ["$categoryInfo.name", 0] },
        isProductListed: "$isListed",
        variantId: "$variants._id",
        color: "$variants.color",
        storage: "$variants.storage",
        sku: "$variants.sku",
        stock: "$variants.stock",
        regularPrice: "$variants.regularPrice",
        salePrice: "$variants.salePrice",
        image: { $arrayElemAt: ["$variants.images", 0] },
        isVariantListed: "$variants.isListed",
        updatedAt: "$updatedAt"
      }
    }
  ];

  // Search filter across product name, SKU, color, storage, brand
  const trimmedSearch = (search || "").trim();
  if (trimmedSearch) {
    const searchRegex = new RegExp(trimmedSearch, "i");
    pipeline.push({
      $match: {
        $or: [
          { productName: searchRegex },
          { sku: searchRegex },
          { color: searchRegex },
          { storage: searchRegex },
          { brandName: searchRegex }
        ]
      }
    });
  }

  // Stock status filter
  const upperStatus = (status || "").trim().toUpperCase();
  if (upperStatus === "OUT_OF_STOCK") {
    pipeline.push({ $match: { stock: { $lte: 0 } } });
  } else if (upperStatus === "LOW_STOCK") {
    pipeline.push({ $match: { stock: { $gt: 0, $lte: LOW_STOCK_THRESHOLD } } });
  } else if (upperStatus === "IN_STOCK") {
    pipeline.push({ $match: { stock: { $gt: LOW_STOCK_THRESHOLD } } });
  }

  // Count matching items
  const countPipeline = [...pipeline, { $count: "total" }];
  const countResult = await Product.aggregate(countPipeline);
  const totalVariants = countResult.length > 0 ? countResult[0].total : 0;

  const totalPages = Math.ceil(totalVariants / parsedLimit) || 1;
  const currentPage = Math.max(1, Math.min(parsedPage, totalPages));
  const skip = (currentPage - 1) * parsedLimit;

  // Sorting & Pagination
  // Low stock and out of stock first to highlight replenishment needs
  pipeline.push({ $sort: { stock: 1, productName: 1 } });
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: parsedLimit });

  const rows = await Product.aggregate(pipeline);

  // Format status for each row
  const inventory = rows.map((item) => {
    let stockStatus = "In Stock";
    if (item.stock <= 0) {
      stockStatus = "Out of Stock";
    } else if (item.stock <= LOW_STOCK_THRESHOLD) {
      stockStatus = "Low Stock";
    }
    return {
      ...item,
      stockStatus
    };
  });

  // Overall catalog summary metrics
  const summaryAgg = await Product.aggregate([
    { $match: { isDeleted: false } },
    { $unwind: "$variants" },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        inStock: {
          $sum: { $cond: [{ $gt: ["$variants.stock", LOW_STOCK_THRESHOLD] }, 1, 0] }
        },
        lowStock: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gt: ["$variants.stock", 0] },
                  { $lte: ["$variants.stock", LOW_STOCK_THRESHOLD] }
                ]
              },
              1,
              0
            ]
          }
        },
        outOfStock: {
          $sum: { $cond: [{ $lte: ["$variants.stock", 0] }, 1, 0] }
        }
      }
    }
  ]);

  const summary = summaryAgg[0] || {
    total: 0,
    inStock: 0,
    lowStock: 0,
    outOfStock: 0
  };

  return {
    inventory,
    totalVariants,
    totalPages,
    currentPage,
    limit: parsedLimit,
    search: trimmedSearch,
    status: upperStatus,
    summary,
    LOW_STOCK_THRESHOLD
  };
};

/**
 * Update stock quantity for a single product variant.
 * Enforces non-negative integers.
 */
const updateVariantStock = async (productId, variantId, newStock) => {
  if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(variantId)) {
    return { success: false, message: "Invalid product or variant ID format." };
  }

  const parsedStock = Number(newStock);
  if (!Number.isInteger(parsedStock) || parsedStock < 0) {
    return {
      success: false,
      message: "Stock quantity must be a non-negative whole number (0, 1, 2...)."
    };
  }

  const product = await Product.findOne({ _id: productId, isDeleted: false });
  if (!product) {
    return { success: false, message: "Product not found or has been deleted." };
  }

  const variant = product.variants.id(variantId);
  if (!variant) {
    return { success: false, message: "Product variant not found." };
  }

  const previousStock = variant.stock;

  const updateResult = await Product.updateOne(
    {
      _id: productId,
      isDeleted: false,
      "variants._id": variantId
    },
    {
      $set: {
        "variants.$.stock": parsedStock
      }
    }
  );

  if (updateResult.modifiedCount !== 1 && previousStock !== parsedStock) {
    return { success: false, message: "Failed to update stock quantity in the database." };
  }

  let stockStatus = "In Stock";
  if (parsedStock <= 0) {
    stockStatus = "Out of Stock";
  } else if (parsedStock <= LOW_STOCK_THRESHOLD) {
    stockStatus = "Low Stock";
  }

  return {
    success: true,
    message: `Stock for SKU ${variant.sku} updated successfully to ${parsedStock}.`,
    productId,
    variantId,
    sku: variant.sku,
    previousStock,
    newStock: parsedStock,
    stockStatus
  };
};

export {
  LOW_STOCK_THRESHOLD,
  getInventory,
  updateVariantStock
};
