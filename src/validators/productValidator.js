const normalizeVariants = (variants) => {

    if (!variants) return [];

    if (Array.isArray(variants)) return variants;

    return Object.values(variants);

};

const validateBasicInfo = (body, errors) => {

    // Product Name

    if (!body.name || body.name.trim() === "") {

        errors.name = "Product name is required";

    } else if (body.name.trim().length < 3) {

        errors.name = "Product name must be at least 3 characters";

    }

    // Description

   if (!body.description || body.description.trim() === "") {

    errors.description = "Description is required";

} else if (body.description.trim().length < 10) {

    errors.description =
        "Description must be at least 10 characters";

}
    // Category

    if (!body.category) {

        errors.category = "Please select a category";

    }

    // Brand

    if (!body.brand) {

        errors.brand = "Please select a brand";

    }

};
const validateVariants = (variants, errors) => {

    if (variants.length === 0) {

        errors.variants = "At least one variant is required";

        return;

    }

    const skuSet = new Set();

    const variantSet = new Set();


variants.forEach((variant, index) => {

    const prefix = `variants.${index}`;

    // Color

    if (!variant.color || !variant.color.trim()) {

        errors[`${prefix}.color`] = "Color is required";

    }

    // Storage

    if (!variant.storage || !variant.storage.trim()) {

        errors[`${prefix}.storage`] = "Storage is required";

    }

    // SKU

    if (!variant.sku || !variant.sku.trim()) {

        errors[`${prefix}.sku`] = "SKU is required";

    } else {

        const sku = variant.sku.trim().toUpperCase();

        if (skuSet.has(sku)) {

            errors[`${prefix}.sku`] = "Duplicate SKU";

        }

        skuSet.add(sku);

    }

    // Duplicate Color + Storage

    const combination =
        `${variant.color?.trim()}-${variant.storage?.trim()}`
            .toLowerCase();

    if (variantSet.has(combination)) {

        errors[`${prefix}.storage`] =
            "Duplicate Color + Storage combination";

    }

    variantSet.add(combination);
 // Regular Price

const regularPrice = Number(variant.regularPrice);

if (
    variant.regularPrice === "" ||
    variant.regularPrice === undefined ||
    isNaN(regularPrice) ||
    regularPrice <= 0
) {

    errors[`${prefix}.regularPrice`] =
        "Regular price must be greater than 0";

}
// Sale Price

const salePrice = Number(variant.salePrice);

if (
    variant.salePrice === "" ||
    variant.salePrice === undefined ||
    isNaN(salePrice) ||
    salePrice <= 0
) {

    errors[`${prefix}.salePrice`] =
        "Sale price must be greater than 0";

} else if (!errors[`${prefix}.regularPrice`] && salePrice > regularPrice) {

    errors[`${prefix}.salePrice`] =
        "Sale price cannot exceed regular price";

}
// Stock

const stock = Number(variant.stock);

if (
    variant.stock === "" ||
    variant.stock === undefined ||
    isNaN(stock) ||
    stock < 0
) {

    errors[`${prefix}.stock`] =
        "Stock cannot be negative";

}

});
};
const validateVariantImages = (variants, files, errors) => {

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    const MAX_FILE_SIZE = 2 * 1024 * 1024;

    variants.forEach((variant, index) => {

        const prefix = `variants.${index}`;

        const imageField = `variantImages_${index}`;

        const variantFiles = (files || []).filter(
            file => file.fieldname === imageField
        );

        const existingImages = variant.existingImages
            ? Array.isArray(variant.existingImages)
                ? variant.existingImages
                : [variant.existingImages]
            : [];

        const replacementFiles = (files || []).filter(
            file => file.fieldname?.startsWith(`replaceImage_${index}_`)
        );

        const totalImages = existingImages.length + variantFiles.length;

        // Minimum Images
        if (totalImages < 3) {

            errors[`${prefix}.images`] =
                "Minimum 3 images are required";

        }

        // Maximum Images

        if (totalImages > 5) {

            errors[`${prefix}.images`] =
                "Maximum 5 images are allowed";

        }

        const allFiles = [...variantFiles, ...replacementFiles];

        for (const file of allFiles) {

            if (!allowedTypes.includes(file.mimetype)) {

                errors[`${prefix}.images`] =
                    "Only JPG, PNG and WEBP images are allowed";

                break;

            }

            if (file.size > MAX_FILE_SIZE) {

                errors[`${prefix}.images`] =
                    "Each image must be less than 2 MB";

                break;

            }

        }

    });

};
const validateProduct = (body, files) => {

    const errors = {};

    validateBasicInfo(body, errors);

const variants = normalizeVariants(body.variants);

validateVariants(variants, errors);

validateVariantImages(
    variants,
    files,
    errors
);
    return {

        isValid: Object.keys(errors).length === 0,

        errors

    };

};
export default validateProduct;