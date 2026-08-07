import * as productService from "../services/productService.js";
import Category from "../models/Category.js";
import Brand from "../models/Brand.js";

const getProductFormData = async () => {

    const [categories, brands] = await Promise.all([
        Category.find({
            isDeleted: false,
            isListed: true
        }).sort({ name: 1 }),

        Brand.find({
            isDeleted: false,
            isListed: true
        }).sort({ name: 1 })
    ]);

    return { categories, brands };

};

const loadProducts = async (req, res, next) => {

    try {

        const result = await productService.getProducts(req.query);

        res.render("admin/products/list", {
            layout: "layouts/admin-layout",
            title: "Products",
            ...result
        });

    } catch (error) {

        next(error);

    }

};

const loadAddProduct = async (req, res, next) => {

    try {

        const { categories, brands } = await getProductFormData();

        res.render("admin/products/add", {
            layout: "layouts/admin-layout",
            title: "Add Product",
            categories,
            brands,
            product: {},
            errors: {},
            message: ""
        });

    } catch (error) {

        next(error);

    }

};



const addProduct = async (req, res, next) => {

    try {

        const result = await productService.createProduct({
    body: req.body,
    files: req.files
});

        if (result.success) {

            req.session.successMessage = result.message;
            return res.redirect("/admin/products");

        }

        const { categories, brands } = await getProductFormData();

        res.render("admin/products/add", {
            layout: "layouts/admin-layout",
            title: "Add Product",
            categories,
            brands,
            product: {
    ...req.body,
    variants: Array.isArray(req.body.variants)
        ? req.body.variants
        : req.body.variants
            ? Object.values(req.body.variants)
            : []
},
            errors: result.errors || {},
            message: result.message || ""
        });

    } catch (error) {

        next(error);

    }

};



const loadEditProduct = async (req, res, next) => {

    try {

        const product = await productService.getProductById(req.params.id);

        if (!product || product.isDeleted) {

            return res.redirect("/admin/products");

        }

        const { categories, brands } = await getProductFormData();

        res.render("admin/products/edit", {
                layout: "layouts/admin-layout",
                title: "Edit Product",
                product,
                categories,
                brands,
                errors: {},
                message: ""
            });

    } catch (error) {

        next(error);

    }

};

const editProduct = async (req, res, next) => {

    try {

        const result = await productService.updateProduct({
            id: req.params.id,
            body: req.body,
            files: req.files
        });

        if (result.success) {

    req.session.successMessage = result.message;

    return res.redirect("/admin/products");

}

        const originalProduct = await productService.getProductById(req.params.id);
        
        let product = {};
        if (originalProduct) {
            product = originalProduct.toObject();
            product.name = req.body.name || product.name;
            product.description = req.body.description || product.description;
            product.category = req.body.category || product.category;
            product.brand = req.body.brand || product.brand;

            const submittedVariants = Array.isArray(req.body.variants)
                ? req.body.variants
                : req.body.variants
                    ? Object.values(req.body.variants)
                    : [];

            product.variants = submittedVariants.map((v) => {
                const images = v.existingImages
                    ? (Array.isArray(v.existingImages)
                        ? [...v.existingImages]
                        : [v.existingImages])
                    : [];
                return {
                    ...v,
                    images
                };
            });
        }

        const { categories, brands } = await getProductFormData();

        res.render("admin/products/edit", {
            layout: "layouts/admin-layout",
            title: "Edit Product",
            product,
            categories,
            brands,
            errors: result.errors || {},
            message: result.message || ""
        });

    } catch (error) {

        next(error);

    }

};



const toggleProductStatus = async (req, res, next) => {

    try {

        const result = await productService.toggleProductStatus(req.params.id);

        res.status(result.success ? 200 : 400).json(result);

    } catch (error) {

        next(error);

    }

};


const deleteProduct = async (req, res, next) => {

    try {

        const result = await productService.deleteProduct(req.params.id);

        res.status(result.success ? 200 : 400).json(result);

    } catch (error) {

        next(error);

    }

};

const loadShop = async (req, res, next) => {

    try {

        const result = await productService.getShopProducts(req.query);

        res.render("user/shop", {
            layout: "layouts/user-layout",
            title: "Shop",
            ...result
        });

    } catch (error) {

        next(error);

    }

};

const loadProductDetails = async (req, res, next) => {
    try {
        const result = await productService.getProductDetails(req.params.id);
        
        if (!result) {
            req.session.errorMessage = "This product is no longer available.";
            return res.redirect("/shop");
        }

        res.render("user/product-details", {
            layout: "layouts/user-layout",
            title: result.product.name,
            product: result.product,
            relatedProducts: result.relatedProducts
        });
    } catch (error) {
        console.error("Load Product Details Error:", error);
        req.session.errorMessage = "Failed to load product details.";
        return res.redirect("/shop");
    }
};

export {
    loadProducts,
    loadAddProduct,
    addProduct,
    loadEditProduct,
    editProduct,
    toggleProductStatus,
    deleteProduct,
    loadShop,
    loadProductDetails
};