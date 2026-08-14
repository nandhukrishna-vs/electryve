import express from "express";

import * as productController from "../controllers/productController.js";
import upload from "../middlewares/uploadMiddleware.js";
import { isAdmin } from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.use(isAdmin); // Apply isAdmin middleware to all routes in this router

// Product List


router.get("/", productController.loadProducts);

// Add Product

router.get("/add", productController.loadAddProduct);

router.post(
    "/add",
    upload.any(),
    productController.addProduct
);

// Edit Product

router.get("/edit/:id", productController.loadEditProduct);

router.post(
    "/edit/:id",
    upload.any(),
    productController.editProduct
);


// Toggle Product Status

router.patch("/:id/toggle", productController.toggleProductStatus);

// Delete Product

router.delete("/:id/delete", productController.deleteProduct);

export default router;