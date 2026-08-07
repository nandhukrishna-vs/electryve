import mongoose from "mongoose";
import slugify from "slugify";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Brand from "../models/Brand.js";
import validateProduct from "../validators/productValidator.js";
import { uploadImages, deleteImage } from "./imageService.js";

const ITEMS_PER_PAGE = 10;

/* ===========================================================
   Helpers
=========================================================== */

const normalizeVariants = (variants) => {

    if (!variants) return [];

    const normalized = Array.isArray(variants)
        ? variants
        : Object.values(variants);

    return normalized.map(variant => ({

        ...variant,

        existingImages: variant.existingImages
            ? Array.isArray(variant.existingImages)
                ? variant.existingImages
                : [variant.existingImages]
            : []

    }));

};
const groupVariantImages = (files = []) => {

    const grouped = {};

    for (const file of files) {

        const match = file.fieldname?.match(/^variantImages_(\d+)$/);

        if (!match) continue;

        const index = Number(match[1]);

        if (!grouped[index]) {
            grouped[index] = [];
        }

        grouped[index].push(file);
    }

    return grouped;

};
const uploadVariantImages = async (groupedFiles) => {

    const uploaded = {};

    for (const index of Object.keys(groupedFiles)) {

        uploaded[index] = await uploadImages(
            groupedFiles[index],
            "products"
        );

    }

    return uploaded;

};
const validateDuplicateSkus = (variants) => {

    const skuSet = new Set();

    for (const variant of variants) {

        const sku = variant.sku.trim().toUpperCase();

        if (skuSet.has(sku)) {

            return {
    success: false,
    message: `Duplicate SKU: ${sku}`
};

        }

        skuSet.add(sku);

    }

};
const validateDuplicateVariants = (variants) => {

    const combinations = new Set();

    for (const variant of variants) {

        const key =
`${variant.color.trim()}-${variant.storage.trim()}`
.toLowerCase();

        if (combinations.has(key)) {

            throw new Error(
                "Duplicate Color + Storage"
            );

        }

        combinations.add(key);

    }

};

/* ===========================================================
   Product List
=========================================================== */

const getProducts = async ({
    page = 1,
    search = ""
}) => {

    page = Number(page);

    const filter = {
        isDeleted: false
    };

    if (search.trim()) {

        filter.name = {
            $regex: search,
            $options: "i"
        };

    }

    const totalProducts =
        await Product.countDocuments(filter);

    const products =
        await Product.find(filter)
            .populate("category", "name")
            .populate("brand", "name")
            .sort({
                createdAt: -1
            })
            .skip((page - 1) * ITEMS_PER_PAGE)
            .limit(ITEMS_PER_PAGE);

    return {

        products,

        currentPage: page,

        totalPages:
            Math.ceil(totalProducts / ITEMS_PER_PAGE),

        search

    };

};

/* ===========================================================
   Create Product
=========================================================== */

const createProduct = async ({
    body,
    files
}) => {

    const validation =
        validateProduct(body, files);

    if (!validation.isValid) {

        return {

            success: false,

            errors: validation.errors

        };

    }

    const name = body.name.trim();

    const existingProduct =
        await Product.findOne({

            name: {
                $regex: `^${name}$`,
                $options: "i"
            },

            isDeleted: false

        });

    if (existingProduct) {

        return {

            success: false,

            errors: {

                name: "Product already exists"

            }

        };

    }

    const category =
        await Category.findById(body.category);

    if (!category || category.isDeleted) {

        return {

            success: false,

            message: "Category not found"

        };

    }

    const brand =
        await Brand.findById(body.brand);

    if (!brand || brand.isDeleted) {

        return {

            success: false,

            message: "Brand not found"

        };

    }

    const variants =
        normalizeVariants(body.variants);
        validateDuplicateSkus(variants);

validateDuplicateVariants(variants);

    const groupedFiles = groupVariantImages(files || []);

const uploadedImages =
Object.keys(groupedFiles).length
    ? await uploadVariantImages(groupedFiles)
    : {};

const variantData = variants.map((variant, index) => ({

    color: variant.color.trim(),

    storage: variant.storage.trim(),

    sku: variant.sku.trim().toUpperCase(),

    regularPrice: Number(variant.regularPrice),

    salePrice: Number(variant.salePrice),

    stock: Number(variant.stock),

    images: uploadedImages[index] || []

}));

    const product =
        new Product({

            name,

            slug: slugify(name, {
                lower: true,
                strict: true
            }),

            description:
                body.description.trim(),

            category:
                body.category,

            brand:
                body.brand,

            variants:
                variantData

        });

    try {
        await product.save();
    } catch (error) {
        const allUploaded = Object.values(uploadedImages).flat();
        for (const imageUrl of allUploaded) {
            try {
                await deleteImage(imageUrl);
            } catch (deleteError) {
                console.error("Rollback failed for new image:", deleteError.message);
            }
        }
        throw error;
    }

    return {

        success: true,

        message:
            "Product created successfully"

    };

};


const getProductById = async (id) => {

    return await Product.findById(id)
        .populate("category")
        .populate("brand");

};



const updateProduct = async ({
    id,
    body,
    files
}) => {

    const validation = validateProduct(body, files);

    if (!validation.isValid) {

        return {
            success: false,
            errors: validation.errors
        };

    }

    const product = await Product.findById(id);

    if (!product || product.isDeleted) {

        return {
            success: false,
            message: "Product not found"
        };

    }

    const name = body.name.trim();

    const existingProduct = await Product.findOne({

        _id: { $ne: id },

        name: {
            $regex: `^${name}$`,
            $options: "i"
        },

        isDeleted: false

    });

    if (existingProduct) {

        return {

            success: false,

            errors: {
                name: "Product already exists"
            }

        };

    }

    const category =
        await Category.findById(body.category);

    if (!category || category.isDeleted) {

        return {
            success: false,
            message: "Category not found"
        };

    }

    const brand =
        await Brand.findById(body.brand);

    if (!brand || brand.isDeleted) {

        return {
            success: false,
            message: "Brand not found"
        };

    }

    const variants =
        normalizeVariants(body.variants);
        validateDuplicateSkus(variants);
validateDuplicateVariants(variants);

    const updatedVariants = [];
    const imagesToDelete = [];
    const newlyUploadedImages = [];

    for (let i = 0; i < variants.length; i++) {

        const variant = variants[i];

        let imageUrls = [];

        // Existing images sent from the form
        if (variant.existingImages) {

            imageUrls = Array.isArray(variant.existingImages)
                ? [...variant.existingImages]
                : [variant.existingImages];

        }

        // Process replacements for existing images using target verification
        for (let j = 0; j < imageUrls.length; j++) {
            const oldUrl = imageUrls[j];
            const targetUrl = body[`replaceTarget_${i}_${j}`];
            
            if (targetUrl && oldUrl === targetUrl) {
                const replacementFile = (files || []).find(
                    file => file.fieldname === `replaceImage_${i}_${j}`
                );
                if (replacementFile) {
                    const [newUrl] = await uploadImages([replacementFile], "products");
                    newlyUploadedImages.push(newUrl);
                    imageUrls[j] = newUrl;
                }
            }
        }

        const oldImages =
            product.variants[i]?.images || [];

        const deletedImages =
            oldImages.filter(
                image => !imageUrls.includes(image)
            );

        imagesToDelete.push(...deletedImages);

        // Newly uploaded images
        const uploadedFiles = (files || []).filter(
            file => file.fieldname === `variantImages_${i}`
        );

        if (uploadedFiles.length > 0) {

            const uploadedImageUrls =
                await uploadImages(uploadedFiles, "products");

            newlyUploadedImages.push(...uploadedImageUrls);
            imageUrls.push(...uploadedImageUrls);

        }

        updatedVariants.push({

            color:
                variant.color.trim(),

            storage:
                variant.storage.trim(),

            sku:
                variant.sku.trim().toUpperCase(),

            regularPrice:
                Number(variant.regularPrice),

            salePrice:
                Number(variant.salePrice),

            stock:
                Number(variant.stock),

            images:
                imageUrls

        });

    }

    product.name = name;

    product.slug = slugify(name, {

        lower: true,

        strict: true

    });

    product.description =
        body.description.trim();

    product.category =
        body.category;

    product.brand =
        body.brand;

    product.variants =
        updatedVariants;

    try {
        await product.save();
    } catch (error) {
        // Clean up newly uploaded S3 images if save fails
        for (const imageUrl of newlyUploadedImages) {
            try {
                await deleteImage(imageUrl);
            } catch (deleteError) {
                console.error("Rollback failed for new image:", deleteError.message);
            }
        }
        throw error;
    }
    
    for (const image of imagesToDelete) {

        try {

            await deleteImage(image);

        } catch (error) {

            console.error(
                "Failed to delete image:",
                image
            );

        }

    }
    return {

        success: true,

        message:
            "Product updated successfully"

    };

};

/* ===========================================================
   Toggle Product Status
=========================================================== */

const toggleProductStatus = async (id) => {

    const product = await Product.findById(id);

    if (!product || product.isDeleted) {

        return {
            success: false,
            message: "Product not found"
        };

    }

    product.isListed = !product.isListed;

    await product.save();

    return {

        success: true,

        message: product.isListed
            ? "Product listed successfully"
            : "Product unlisted successfully"

    };

};

/* ===========================================================
   Delete Product
=========================================================== */

const deleteProduct = async (id) => {

    const product = await Product.findById(id);

    if (!product || product.isDeleted) {

        return {
            success: false,
            message: "Product not found"
        };

    }

    product.isDeleted = true;

    await product.save();

    return {

        success: true,

        message: "Product deleted successfully"

    };

};
/* ===========================================================
   Shop Products
=========================================================== */

const getShopProducts = async (query) => {

    const page = Number(query.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;

    // Fetch active categories and brands in parallel for filtering and sidebar display
    const [activeCategories, activeBrands] = await Promise.all([
        Category.find({ isListed: true, isDeleted: false }).lean(),
        Brand.find({ isListed: true, isDeleted: false }).lean()
    ]);

    const activeCategoryIds = activeCategories.map(c => c._id);
    const activeBrandIds = activeBrands.map(b => b._id);

    // Initial base filters
    const filter = {
        isDeleted: false,
        isListed: true,
        category: { $in: activeCategoryIds },
        brand: { $in: activeBrandIds }
    };

    // 1. Search filter
    const search = query.search || "";
    if (search.trim()) {
        filter.name = {
            $regex: search.trim(),
            $options: "i"
        };
    }

    // 2. Category filter (handle string or array)
    let selectedCategories = [];
    if (query.category) {
        selectedCategories = Array.isArray(query.category) ? query.category : [query.category];
        // Map selected names or IDs to ObjectId
        const selectedCategoryIds = activeCategories
            .filter(c => selectedCategories.includes(c.name) || selectedCategories.includes(c._id.toString()))
            .map(c => c._id);
        filter.category = { $in: selectedCategoryIds };
    }

    // 3. Brand filter (handle string or array)
    let selectedBrands = [];
    if (query.brand) {
        selectedBrands = Array.isArray(query.brand) ? query.brand : [query.brand];
        const selectedBrandIds = activeBrands
            .filter(b => selectedBrands.includes(b.name) || selectedBrands.includes(b._id.toString()))
            .map(b => b._id);
        filter.brand = { $in: selectedBrandIds };
    }

    // 4. Price range filters
    let selectedPrices = [];
    if (query.price) {
        selectedPrices = Array.isArray(query.price) ? query.price : [query.price];
        const priceOrConditions = [];
        selectedPrices.forEach(p => {
            if (p === 'under-25000') priceOrConditions.push({ salePrice: { $lt: 25000 } });
            else if (p === '25000-50000') priceOrConditions.push({ salePrice: { $gte: 25000, $lte: 50000 } });
            else if (p === '50000-75000') priceOrConditions.push({ salePrice: { $gte: 50000, $lte: 75000 } });
            else if (p === 'above-75000') priceOrConditions.push({ salePrice: { $gt: 75000 } });
        });

        if (priceOrConditions.length > 0) {
            filter.variants = {
                $elemMatch: {
                    isListed: true,
                    $or: priceOrConditions
                }
            };
        }
    }

    // If no price filter is applied, we still ensure only products with at least one active variant are retrieved
    if (!filter.variants) {
        filter.variants = {
            $elemMatch: {
                isListed: true
            }
        };
    }

    // 5. Sorting
    const sortOption = query.sort || "newest";
    let sortQuery = { createdAt: -1 };
    if (sortOption === "price-asc") {
        sortQuery = { "variants.salePrice": 1 };
    } else if (sortOption === "price-desc") {
        sortQuery = { "variants.salePrice": -1 };
    } else if (sortOption === "alpha-asc") {
        sortQuery = { name: 1 };
    } else if (sortOption === "alpha-desc") {
        sortQuery = { name: -1 };
    }

    // Fetch products and count in parallel using Promise.all
    const [rawProducts, totalProducts] = await Promise.all([
        Product.find(filter)
            .populate("category")
            .populate("brand")
            .sort(sortQuery)
            .skip(skip)
            .limit(limit)
            .lean(),
        Product.countDocuments(filter)
    ]);

    // 6. Compute business logic details on the service layer
    const products = rawProducts.map(p => {
        // Find the first listed/active variant
        const defaultVariant = p.variants.find(v => v.isListed) || p.variants[0] || null;

        let discountPercentage = 0;
        let stockStatus = "Out of Stock";

        if (defaultVariant) {
            // Compute discount
            const regPrice = defaultVariant.regularPrice || 0;
            const salePrice = defaultVariant.salePrice || 0;
            if (regPrice > 0 && salePrice < regPrice) {
                discountPercentage = Math.round(((regPrice - salePrice) / regPrice) * 100);
            }

            // Compute stock status
            if (defaultVariant.stock <= 0) {
                stockStatus = "Out of Stock";
            } else if (defaultVariant.stock <= 5) {
                stockStatus = "Low Stock";
            } else {
                stockStatus = "In Stock";
            }
        }

        return {
            ...p,
            defaultVariant,
            discountPercentage,
            stockStatus
        };
    });

    return {
        products,
        currentPage: page,
        totalPages: Math.ceil(totalProducts / limit),
        categories: activeCategories,
        brands: activeBrands,
        search,
        selectedCategories,
        selectedBrands,
        selectedPrices,
        sortOption
    };
};

const getProductDetails = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
    }

    const product = await Product.findOne({
        _id: id,
        isDeleted: false,
        isListed: true
    })
    .populate({
        path: "category",
        match: { isDeleted: false, isListed: true }
    })
    .populate({
        path: "brand",
        match: { isDeleted: false, isListed: true }
    })
    .lean();

    if (!product || !product.category || !product.brand) {
        return null;
    }

    const fallbackSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%23f3f4f6"/><text x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-family="sans-serif" font-size="16">No Image Available</text></svg>`;

    const rawVariants = Array.isArray(product.variants) ? product.variants : [];
    
    const activeVariants = rawVariants
        .filter(v => v && v.isListed)
        .map(v => {
            const vImages = Array.isArray(v.images) ? v.images : [];
            const displayImage = vImages.length > 0 ? vImages[0] : fallbackSvg;
            const regPrice = v.regularPrice || 0;
            const salePrice = v.salePrice || 0;
            let discountPercentage = 0;
            if (regPrice > 0 && salePrice < regPrice) {
                discountPercentage = Math.round(((regPrice - salePrice) / regPrice) * 100);
            }
            const stockStatus = v.stock <= 0 ? "Out of Stock" : (v.stock <= 5 ? "Low Stock" : "In Stock");

            return {
                ...v,
                display: {
                    image: displayImage,
                    images: vImages.length > 0 ? vImages : [fallbackSvg],
                    salePrice: salePrice,
                    regularPrice: regPrice,
                    discountPercentage: discountPercentage,
                    stockStatus: stockStatus,
                    sku: v.sku || '-',
                    stock: v.stock
                }
            };
        });

    if (activeVariants.length === 0) {
        return null;
    }

    product.variants = activeVariants;
    const defaultVariant = activeVariants[0];

    const rawRelated = await Product.find({
        category: product.category._id,
        _id: { $ne: product._id },
        isDeleted: false,
        isListed: true,
        variants: {
            $elemMatch: {
                isListed: true
            }
        }
    })
    .populate({
        path: "category",
        match: { isDeleted: false, isListed: true }
    })
    .populate({
        path: "brand",
        match: { isDeleted: false, isListed: true }
    })
    .limit(8)
    .lean();

    const relatedProducts = rawRelated.map(rp => {
        const rpVariants = Array.isArray(rp.variants) ? rp.variants : [];
        const rpActiveVariants = rpVariants.filter(v => v && v.isListed);
        if (rpActiveVariants.length === 0) {
            return null;
        }

        const rpDefaultVariant = rpActiveVariants[0];
        const rpImages = Array.isArray(rpDefaultVariant.images) ? rpDefaultVariant.images : [];
        
        if (!rpDefaultVariant.salePrice || rpDefaultVariant.salePrice <= 0) {
            return null;
        }

        const displayImage = rpImages.length > 0 ? rpImages[0] : fallbackSvg;
        const regPrice = rpDefaultVariant.regularPrice || 0;
        const salePrice = rpDefaultVariant.salePrice || 0;
        let discountPercentage = 0;
        if (regPrice > 0 && salePrice < regPrice) {
            discountPercentage = Math.round(((regPrice - salePrice) / regPrice) * 100);
        }
        const stockStatus = rpDefaultVariant.stock <= 0 ? "Out of Stock" : (rpDefaultVariant.stock <= 5 ? "Low Stock" : "In Stock");

        if (!rp.category || !rp.brand) {
            return null;
        }

        return {
            ...rp,
            defaultVariant: {
                ...rpDefaultVariant,
                display: {
                    image: displayImage,
                    images: rpImages.length > 0 ? rpImages : [fallbackSvg],
                    salePrice: salePrice,
                    regularPrice: regPrice,
                    discountPercentage: discountPercentage,
                    stockStatus: stockStatus,
                    sku: rpDefaultVariant.sku || '-',
                    stock: rpDefaultVariant.stock
                }
            }
        };
    }).filter(Boolean);

    return {
        product: {
            ...product,
            defaultVariant
        },
        relatedProducts
    };
};

export {

    getProducts,

    createProduct,

    getProductById,

    updateProduct,

    toggleProductStatus,

    deleteProduct,

    getShopProducts,

    getProductDetails

};
