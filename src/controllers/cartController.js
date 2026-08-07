import * as cartService from "../services/cartService.js";

/**
 * Render user cart view page
 */
const loadCart = async (req, res, next) => {
    try {
        const userId = req.session.user.id;
        const cartData = await cartService.getCart(userId);

        res.render("user/cart", {
            layout: "layouts/user-layout",
            title: "Shopping Cart",
            items: cartData.items,
            canCheckout: cartData.canCheckout,
            cartSummary: cartData.cartSummary,
            priceChanges: cartData.priceChanges
        });
    } catch (error) {
        console.error("Load Cart Error:", error);
        next(error);
    }
};

/**
 * JSON Endpoint: get current cart quantity count
 */
const getCartCount = async (req, res, next) => {
    try {
        if (!req.session || !req.session.user) {
            return res.json({ success: true, count: 0 });
        }
        const count = await cartService.getCartCount(req.session.user.id);
        return res.json({ success: true, count });
    } catch (error) {
        console.error("Get Cart Count Error:", error);
        return res.status(500).json({ success: false, message: "Server error checking cart count." });
    }
};

/**
 * JSON Endpoint: Add product to cart
 */
const addToCart = async (req, res, next) => {
    try {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: "Please log in first to add items to your cart." });
        }
        
        const userId = req.session.user.id;
        const { productId, variantId, quantity } = req.body;

        const qty = parseInt(quantity, 10) || 1;
        const result = await cartService.addToCart(userId, productId, variantId, qty);

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.json(result);
    } catch (error) {
        console.error("Add to Cart Controller Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error adding to cart." });
    }
};

/**
 * JSON Endpoint: Update cart quantity
 */
const updateQuantity = async (req, res, next) => {
    try {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: "Please log in to manage your cart." });
        }

        const userId = req.session.user.id;
        const { productId, variantId, quantity } = req.body;

        const qty = parseInt(quantity, 10);
        if (isNaN(qty) || qty < 1) {
            return res.status(400).json({ success: false, message: "Invalid quantity parameter." });
        }

        const result = await cartService.updateQuantity(userId, productId, variantId, qty);
        
        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.json(result);
    } catch (error) {
        console.error("Update Cart Quantity Controller Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error updating quantity." });
    }
};

/**
 * JSON Endpoint: Remove item from cart
 */
const removeItem = async (req, res, next) => {
    try {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: "Please log in to manage your cart." });
        }

        const userId = req.session.user.id;
        const { productId, variantId } = req.body;

        const result = await cartService.removeItem(userId, productId, variantId);

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.json(result);
    } catch (error) {
        console.error("Remove Cart Item Controller Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error removing item." });
    }
};

export {
    loadCart,
    getCartCount,
    addToCart,
    updateQuantity,
    removeItem
};
