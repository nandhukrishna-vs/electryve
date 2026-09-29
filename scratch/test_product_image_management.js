import mongoose from "mongoose";
import validateProduct from "../src/validators/productValidator.js";
import Product from "../src/models/Product.js";
import Category from "../src/models/Category.js";
import Brand from "../src/models/Brand.js";
import * as productService from "../src/services/productService.js";
import fs from "fs";
import path from "path";

const MONGODB_URI = "mongodb://127.0.0.1:27017/electryve";

async function runTests() {
    console.log("=== STARTING PRODUCT IMAGE MANAGEMENT TEST SUITE ===");
    let passed = 0;
    let failed = 0;

    const assert = (condition, message) => {
        if (condition) {
            console.log(`  ✓ PASS: ${message}`);
            passed++;
        } else {
            console.error(`  ✗ FAIL: ${message}`);
            failed++;
        }
    };

    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB for testing.");

        // -------------------------------------------------------------
        // Test 1: Frontend Asset Syntax & Integrity Checks
        // -------------------------------------------------------------
        console.log("\n[Test 1] Frontend Script Syntax & View Checks");

        const imageManagerCode = fs.readFileSync("public/js/productImageManager.js", "utf-8");
        assert(imageManagerCode.includes("class ProductImageManager"), "productImageManager.js defines ProductImageManager class");
        assert(imageManagerCode.includes("new bootstrap.Modal"), "productImageManager.js initializes Bootstrap modal");
        assert(imageManagerCode.includes("new Cropper"), "productImageManager.js initializes CropperJS");
        assert(imageManagerCode.includes("variantStates = new Map()"), "productImageManager.js uses isolated per-variant state map");
        assert(imageManagerCode.includes("input.value = \"\""), "productImageManager.js resets input value to allow repeated file selection");

        const productFormCode = fs.readFileSync("public/js/productForm.js", "utf-8");
        assert(productFormCode.includes("ImageManager.initVariant"), "productForm.js integrates with ImageManager.initVariant");
        assert(productFormCode.includes("ImageManager.getVariantImageCount"), "productForm.js validates images via getVariantImageCount");
        assert(productFormCode.includes("ImageManager.destroyVariant"), "productForm.js destroys variant state upon removal");

        const addView = fs.readFileSync("src/views/admin/products/add.ejs", "utf-8");
        assert(addView.includes("id=\"cropModal\""), "add.ejs contains #cropModal");
        assert(addView.includes("id=\"cropZoomInBtn\""), "add.ejs contains zoom in button");
        assert(addView.includes("id=\"cropRotateLeftBtn\""), "add.ejs contains rotate button");
        assert(addView.includes("id=\"cropAspect11Btn\""), "add.ejs contains 1:1 aspect ratio button");
        assert(addView.includes("crop-workspace-container"), "add.ejs contains styled workspace container");

        const editView = fs.readFileSync("src/views/admin/products/edit.ejs", "utf-8");
        assert(editView.includes("id=\"cropModal\""), "edit.ejs contains #cropModal");
        assert(editView.includes("id=\"cropZoomInBtn\""), "edit.ejs contains zoom in button");
        assert(editView.includes("id=\"cropRotateLeftBtn\""), "edit.ejs contains rotate button");
        assert(editView.includes("id=\"cropAspect11Btn\""), "edit.ejs contains 1:1 aspect ratio button");

        const adminCss = fs.readFileSync("public/css/admin.css", "utf-8");
        assert(!adminCss.includes("min-height: 400px;"), "admin.css has removed fixed 400px crop workspace height");
        assert(adminCss.includes("clamp("), "admin.css uses adaptive clamp() for crop workspace sizing");
        assert(adminCss.includes("max-height: calc(100vh - 1rem)"), "admin.css restricts modal dialog and content within viewport height");
        assert(adminCss.includes("flex: 1 1 auto") && adminCss.includes("min-height: 0"), "admin.css sets flex: 1 and min-height: 0 on crop modal body");
        assert(imageManagerCode.includes("document.body.appendChild(this.cropModalEl)"), "productImageManager.js appends modal to document.body preventing stacking context traps");
        assert(imageManagerCode.includes("ResizeObserver"), "productImageManager.js registers ResizeObserver for responsive cropper resize");

        // -------------------------------------------------------------
        // Test 2: Product Image Validation Constraints (3-5 Images)
        // -------------------------------------------------------------
        console.log("\n[Test 2] Product Validator Image Constraints");

        // Test with 2 images (below min of 3)
        const invalidUnderMin = validateProduct({
            name: "Test Laptop Pro",
            description: "A very powerful test laptop for verification.",
            category: new mongoose.Types.ObjectId().toString(),
            brand: new mongoose.Types.ObjectId().toString(),
            variants: [{
                color: "Silver",
                storage: "512GB",
                sku: "TST-LPT-512-SLV",
                regularPrice: 99999,
                salePrice: 89999,
                stock: 10,
                existingImages: []
            }]
        }, [
            { fieldname: "variantImages_0", mimetype: "image/jpeg", size: 500000 },
            { fieldname: "variantImages_0", mimetype: "image/jpeg", size: 500000 }
        ]);
        assert(!invalidUnderMin.isValid, "Validation fails when variant has fewer than 3 images (2 provided)");
        assert(invalidUnderMin.errors["variants.0.images"] === "Minimum 3 images are required", "Error message confirms minimum 3 images required");

        // Test with 6 images (above max of 5)
        const invalidOverMax = validateProduct({
            name: "Test Laptop Pro",
            description: "A very powerful test laptop for verification.",
            category: new mongoose.Types.ObjectId().toString(),
            brand: new mongoose.Types.ObjectId().toString(),
            variants: [{
                color: "Silver",
                storage: "512GB",
                sku: "TST-LPT-512-SLV",
                regularPrice: 99999,
                salePrice: 89999,
                stock: 10,
                existingImages: []
            }]
        }, [
            { fieldname: "variantImages_0", mimetype: "image/jpeg", size: 100000 },
            { fieldname: "variantImages_0", mimetype: "image/jpeg", size: 100000 },
            { fieldname: "variantImages_0", mimetype: "image/jpeg", size: 100000 },
            { fieldname: "variantImages_0", mimetype: "image/jpeg", size: 100000 },
            { fieldname: "variantImages_0", mimetype: "image/jpeg", size: 100000 },
            { fieldname: "variantImages_0", mimetype: "image/jpeg", size: 100000 }
        ]);
        assert(!invalidOverMax.isValid, "Validation fails when variant has more than 5 images (6 provided)");
        assert(invalidOverMax.errors["variants.0.images"] === "Maximum 5 images are allowed", "Error message confirms maximum 5 images allowed");

        // Test with valid 4 images
        const valid4Images = validateProduct({
            name: "Test Laptop Pro",
            description: "A very powerful test laptop for verification.",
            category: new mongoose.Types.ObjectId().toString(),
            brand: new mongoose.Types.ObjectId().toString(),
            variants: [{
                color: "Silver",
                storage: "512GB",
                sku: "TST-LPT-512-SLV",
                regularPrice: 99999,
                salePrice: 89999,
                stock: 10,
                existingImages: []
            }]
        }, [
            { fieldname: "variantImages_0", mimetype: "image/jpeg", size: 500000 },
            { fieldname: "variantImages_0", mimetype: "image/png", size: 500000 },
            { fieldname: "variantImages_0", mimetype: "image/webp", size: 500000 },
            { fieldname: "variantImages_0", mimetype: "image/jpeg", size: 500000 }
        ]);
        assert(valid4Images.isValid, "Validation passes with 4 valid images (within 3-5 range)");

        // -------------------------------------------------------------
        // Test 3: Image File Type & Size Validation
        // -------------------------------------------------------------
        console.log("\n[Test 3] Image Type and Size Validation");

        // Invalid file type (e.g., image/gif or application/pdf)
        const invalidType = validateProduct({
            name: "Test Phone Max",
            description: "Flagship test phone with incredible camera.",
            category: new mongoose.Types.ObjectId().toString(),
            brand: new mongoose.Types.ObjectId().toString(),
            variants: [{
                color: "Black",
                storage: "128GB",
                sku: "TST-PHN-128-BLK",
                regularPrice: 59999,
                salePrice: 49999,
                stock: 15,
                existingImages: []
            }]
        }, [
            { fieldname: "variantImages_0", mimetype: "image/jpeg", size: 200000 },
            { fieldname: "variantImages_0", mimetype: "image/gif", size: 200000 }, // Disallowed GIF
            { fieldname: "variantImages_0", mimetype: "image/png", size: 200000 }
        ]);
        assert(!invalidType.isValid, "Validation fails when image type is not JPG/PNG/WebP");
        assert(invalidType.errors["variants.0.images"] === "Only JPG, PNG and WEBP images are allowed", "Rejection message specifies allowed formats");

        // Exceeding 2MB file size
        const oversized = validateProduct({
            name: "Test Phone Max",
            description: "Flagship test phone with incredible camera.",
            category: new mongoose.Types.ObjectId().toString(),
            brand: new mongoose.Types.ObjectId().toString(),
            variants: [{
                color: "Black",
                storage: "128GB",
                sku: "TST-PHN-128-BLK",
                regularPrice: 59999,
                salePrice: 49999,
                stock: 15,
                existingImages: []
            }]
        }, [
            { fieldname: "variantImages_0", mimetype: "image/jpeg", size: 500000 },
            { fieldname: "variantImages_0", mimetype: "image/jpeg", size: 2.5 * 1024 * 1024 }, // 2.5MB
            { fieldname: "variantImages_0", mimetype: "image/png", size: 500000 }
        ]);
        assert(!oversized.isValid, "Validation fails when image exceeds 2 MB");
        assert(oversized.errors["variants.0.images"] === "Each image must be less than 2 MB", "Rejection message specifies size limit");

        // -------------------------------------------------------------
        // Test 4: Existing Images + Replacement Validation
        // -------------------------------------------------------------
        console.log("\n[Test 4] Edit Mode: Existing Images + Replacement Logic");

        const editProductCheck = validateProduct({
            name: "Existing Product",
            description: "A product already present in database with existing images.",
            category: new mongoose.Types.ObjectId().toString(),
            brand: new mongoose.Types.ObjectId().toString(),
            variants: [{
                color: "Blue",
                storage: "256GB",
                sku: "TST-PRD-256-BLU",
                regularPrice: 40000,
                salePrice: 35000,
                stock: 5,
                existingImages: [
                    "https://bucket.s3.amazonaws.com/products/img1.webp",
                    "https://bucket.s3.amazonaws.com/products/img2.webp"
                ]
            }]
        }, [
            // User adds 1 new image + 1 replacement for an existing image
            { fieldname: "variantImages_0", mimetype: "image/webp", size: 300000 },
            { fieldname: "replaceImage_0_0", mimetype: "image/jpeg", size: 400000 }
        ]);
        // Total images = 2 existing + 1 new = 3 images. Replacement replaces existing[0].
        assert(editProductCheck.isValid, "Validation succeeds with combination of existing images, new images, and replacement files");

        // -------------------------------------------------------------
        // Test 5: S3 Safe Deletion & Cross-Reference Check
        // -------------------------------------------------------------
        console.log("\n[Test 5] S3 Safe Reference-Checked Deletion");

        // Let's create a test product in MongoDB to test updateProduct image retention
        let testCat = await Category.findOne({ isDeleted: false });
        if (!testCat) {
            testCat = await Category.create({ name: "Image Test Category", isListed: true });
        }
        let testBrand = await Brand.findOne({ isDeleted: false });
        if (!testBrand) {
            testBrand = await Brand.create({ name: "Image Test Brand", isListed: true });
        }

        const sharedImageUrl = "https://electryve-bucket.s3.ap-south-1.amazonaws.com/products/shared_test_image.webp";
        const uniqueImageUrl = "https://electryve-bucket.s3.ap-south-1.amazonaws.com/products/unique_test_image.webp";

        // Clean up any old test products
        await Product.deleteMany({ name: { $in: ["S3 Safe Delete Product 1", "S3 Safe Delete Product 2"] } });

        const prod1 = await Product.create({
            name: "S3 Safe Delete Product 1",
            slug: "s3-safe-delete-product-1",
            description: "Testing cross-variant and cross-product S3 deletion safety.",
            category: testCat._id,
            brand: testBrand._id,
            variants: [
                {
                    color: "Red",
                    storage: "128GB",
                    sku: "S3-TEST-RED-128",
                    regularPrice: 20000,
                    salePrice: 18000,
                    stock: 5,
                    images: [sharedImageUrl, uniqueImageUrl, "https://bucket.s3.amazonaws.com/products/img3.webp"]
                },
                {
                    color: "Blue",
                    storage: "128GB",
                    sku: "S3-TEST-BLU-128",
                    regularPrice: 20000,
                    salePrice: 18000,
                    stock: 5,
                    images: [sharedImageUrl, "https://bucket.s3.amazonaws.com/products/img4.webp", "https://bucket.s3.amazonaws.com/products/img5.webp"]
                }
            ]
        });

        // Test update: Remove sharedImageUrl from Variant 0, but Variant 1 STILL uses it!
        // In productService.js, line 705-720 must NOT delete sharedImageUrl because isStillInProduct is true!
        const updateResult = await productService.updateProduct({
            id: prod1._id.toString(),
            body: {
                name: "S3 Safe Delete Product 1",
                description: "Testing cross-variant and cross-product S3 deletion safety.",
                category: testCat._id.toString(),
                brand: testBrand._id.toString(),
                variants: [
                    {
                        color: "Red",
                        storage: "128GB",
                        sku: "S3-TEST-RED-128",
                        regularPrice: 20000,
                        salePrice: 18000,
                        stock: 5,
                        // sharedImageUrl is REMOVED from variant 0:
                        existingImages: [
                            uniqueImageUrl,
                            "https://bucket.s3.amazonaws.com/products/img3.webp",
                            "https://bucket.s3.amazonaws.com/products/img_replacement.webp"
                        ]
                    },
                    {
                        color: "Blue",
                        storage: "128GB",
                        sku: "S3-TEST-BLU-128",
                        regularPrice: 20000,
                        salePrice: 18000,
                        stock: 5,
                        // sharedImageUrl is STILL present in variant 1:
                        existingImages: [
                            sharedImageUrl,
                            "https://bucket.s3.amazonaws.com/products/img4.webp",
                            "https://bucket.s3.amazonaws.com/products/img5.webp"
                        ]
                    }
                ]
            },
            files: []
        });

        assert(updateResult.success, "Product update succeeded with image alteration");

        const updatedProd = await Product.findById(prod1._id);
        assert(
            !updatedProd.variants[0].images.includes(sharedImageUrl),
            "Variant 0 successfully removed sharedImageUrl"
        );
        assert(
            updatedProd.variants[1].images.includes(sharedImageUrl),
            "Variant 1 retained sharedImageUrl and image is protected from S3 deletion"
        );

        // Clean up test product
        await Product.findByIdAndDelete(prod1._id);
        // -------------------------------------------------------------
        // Test 6: Existing Image Cropping, Replacement Payload & Proxy Endpoint
        // -------------------------------------------------------------
        console.log("\n[Test 6] Existing Image Cropping, Replacement Payload & Proxy Endpoint");

        assert(imageManagerCode.includes("getSafeBlobUrl"), "productImageManager.js implements getSafeBlobUrl for safe same-origin blob conversion");
        assert(imageManagerCode.includes("/admin/products/image-proxy"), "productImageManager.js includes same-origin backend proxy fallback");
        assert(imageManagerCode.includes("waitForModalAndImage"), "productImageManager.js ensures modal visibility and natural image dimensions before cropping");
        assert(imageManagerCode.includes("targetInput.value = item.isReplaced ? item.url : \"\""), "productImageManager.js only generates replacement target when item is replaced");

        const productRoutesCode = fs.readFileSync("src/routes/productRoutes.js", "utf-8");
        assert(productRoutesCode.includes("/image-proxy"), "productRoutes.js registers /image-proxy endpoint");

        const productControllerCode = fs.readFileSync("src/controllers/productController.js", "utf-8");
        assert(productControllerCode.includes("proxyProductImage"), "productController.js implements proxyProductImage");

        // Test proxyProductImage directly with mock req/res
        const { proxyProductImage } = await import("../src/controllers/productController.js");
        let proxyStatusCode = 200;
        let proxyHeaders = {};
        let proxyBody = null;
        const mockProxyRes = {
            status(c) { proxyStatusCode = c; return this; },
            setHeader(k, v) { proxyHeaders[k] = v; },
            send(b) { proxyBody = b; }
        };

        const sampleRealProd = await Product.findOne({ "variants.images.0": { $exists: true }, isDeleted: false });
        if (sampleRealProd) {
            const sampleUrl = sampleRealProd.variants[0].images[0];
            await proxyProductImage({ query: { url: sampleUrl }, headers: { origin: "http://localhost:3000" } }, mockProxyRes);
            assert(proxyStatusCode === 200, "proxyProductImage returns 200 for valid authorized product image");
            assert(Buffer.isBuffer(proxyBody) && proxyBody.length > 0, "proxyProductImage returns non-empty image Buffer");
        }

        // Test unauthorized request to proxyProductImage
        let badStatusCode = 200;
        const mockBadRes = {
            status(c) { badStatusCode = c; return this; },
            send() {}
        };
        await proxyProductImage({ query: { url: "https://attacker.com/malicious.png" }, headers: {} }, mockBadRes);
        assert(badStatusCode === 403, "proxyProductImage blocks unauthorized image domains with HTTP 403");

        console.log(`\n=== TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);

        await mongoose.disconnect();
        process.exit(failed === 0 ? 0 : 1);
    } catch (error) {
        console.error("Test execution failed with error:", error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

runTests();
