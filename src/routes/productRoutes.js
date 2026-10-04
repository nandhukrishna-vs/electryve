import express from "express";

import * as productController from "../controllers/productController.js";
import upload from "../middlewares/uploadMiddleware.js";
import { isAdmin } from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.use(isAdmin); // Apply isAdmin middleware to all routes in this router

// Product List
router.get("/", productController.loadProducts);

// Secure Same-Origin Image Proxy for Admin Cropper
router.get("/image-proxy", productController.proxyProductImage);

// Add Product

router.route("/add")
    .get(productController.loadAddProduct)
    .post(upload.any(), productController.addProduct);

// Edit Product

router.route("/edit/:id")
    .get(productController.loadEditProduct)
    .post(upload.any(), productController.editProduct);


// Toggle Product Status

router.patch("/:id/toggle", productController.toggleProductStatus);

// Delete Product

router.delete("/:id/delete", productController.deleteProduct);

export default router;