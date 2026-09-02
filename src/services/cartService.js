import mongoose from "mongoose";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Brand from "../models/Brand.js";
import { MAX_CART_QUANTITY, SHIPPING_CHARGE, FREE_SHIPPING_MIN_SUBTOTAL } from "../config/cartConfig.js";
import { removeItemForCart } from "./wishlistService.js";

const fallbackSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%23f3f4f6"/><text x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-family="sans-serif" font-size="16">No Image Available</text></svg>`;

/**
 * Reusable validation helper for checking item viability
 */
const validateCartItem = async (productId, variantId) => {
    if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(variantId)) {
        return { isValid: false, error: "Invalid product or variant ID format." };
    }

    const product = await Product.findOne({
        _id: productId,
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
        return { isValid: false, error: "This product is no longer available." };
    }

    const rawVariants = Array.isArray(product.variants) ? product.variants : [];
    const variant = rawVariants.find(v => v && v._id.toString() === variantId.toString() && v.isListed);

    if (!variant) {
        return { isValid: false, error: "Selected product variant is unavailable." };
    }

    return { isValid: true, product, variant, error: null };
};

/**
 * Retrieve total items count in user's cart
 */
const getCartCount = async (userId) => {
    if (!userId) return 0;
    const cart = await Cart.findOne({ user: userId }).lean();
    if (!cart || !Array.isArray(cart.items)) return 0;
    return cart.items.reduce((sum, item) => sum + item.quantity, 0);
};

/**
 * Fetch and refresh the user's cart
 */
const getCart = async (userId) => {
    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
        return {
            items: [],
            canCheckout: false,
            cartSummary: { subtotal: 0, shipping: 0, discount: 0, grandTotal: 0 },
            priceChanges: []
        };
    }

    let isModified = false;
    const priceChanges = [];
    const processedItems = [];
    let subtotal = 0;
    let discount = 0;
    let hasUnavailableItems = false;
    let hasOutOfStockItems = false;

    // Validate and process each item
    for (let item of cart.items) {
        const check = await validateCartItem(item.product, item.variantId);
        
        if (!check.isValid) {
            hasUnavailableItems = true;
            processedItems.push({
                product: { _id: item.product, name: item.nameSnapshot },
                variantId: item.variantId,
                nameSnapshot: item.nameSnapshot,
                imageSnapshot: item.imageSnapshot,
                variantSnapshot: item.variantSnapshot,
                quantity: item.quantity,
                priceSnapshot: item.priceSnapshot,
                isUnavailable: true,
                isOutOfStock: false,
                statusMessage: "This product is no longer available."
            });
            continue;
        }

        const { product, variant } = check;
        let itemQuantity = item.quantity;
        let itemPrice = variant.salePrice;

        // Stock Revalidation
        let isItemOutOfStock = false;
        let statusMessage = "";

        if (variant.stock <= 0) {
            isItemOutOfStock = true;
            hasOutOfStockItems = true;
            statusMessage = "Out of Stock";
        } else if (itemQuantity > variant.stock) {
            itemQuantity = variant.stock;
            item.quantity = variant.stock;
            isModified = true;
            priceChanges.push(`Quantity of "${product.name}" reduced to ${variant.stock} due to stock limits.`);
        }

        // Price Snapshot updates
        if (item.priceSnapshot !== itemPrice) {
            item.priceSnapshot = itemPrice;
            item.nameSnapshot = product.name; // Keep name snap current
            item.variantSnapshot = `${variant.color} / ${variant.storage}`;
            item.imageSnapshot = (Array.isArray(variant.images) && variant.images.length > 0) ? variant.images[0] : fallbackSvg;
            isModified = true;
            priceChanges.push(`The price of "${product.name} (${variant.color}/${variant.storage})" has changed. Your cart has been updated.`);
        }

        // Totals accumulation for valid available stock items
        if (!isItemOutOfStock) {
            subtotal += itemQuantity * itemPrice;
            const itemRegPrice = variant.regularPrice || itemPrice;
            if (itemRegPrice > itemPrice) {
                discount += itemQuantity * (itemRegPrice - itemPrice);
            }
        }

        processedItems.push({
            product: {
                _id: product._id,
                name: product.name,
                category: product.category,
                brand: product.brand
            },
            variantId: variant._id,
            nameSnapshot: product.name,
            imageSnapshot: (Array.isArray(variant.images) && variant.images.length > 0) ? variant.images[0] : fallbackSvg,
            variantSnapshot: `${variant.color} / ${variant.storage}`,
            quantity: itemQuantity,
            priceSnapshot: itemPrice,
            regularPrice: variant.regularPrice || itemPrice,
            discountPercentage: (variant.regularPrice > 0 && itemPrice < variant.regularPrice) ? Math.round(((variant.regularPrice - itemPrice) / variant.regularPrice) * 100) : 0,
            stock: variant.stock,
            isUnavailable: false,
            isOutOfStock: isItemOutOfStock,
            statusMessage: statusMessage
        });
    }

    if (isModified) {
        // Save database updates
        await cart.save();
    }

    // Shipping calculations
    let shipping = 0;
    if (subtotal > 0) {
        shipping = subtotal >= FREE_SHIPPING_MIN_SUBTOTAL ? 0 : SHIPPING_CHARGE;
    }
    const grandTotal = subtotal + shipping;

    // Check checkout viability
    const canCheckout = processedItems.length > 0 && !hasUnavailableItems && !hasOutOfStockItems;

    return {
        items: processedItems,
        canCheckout,
        cartSummary: {
            subtotal,
            shipping,
            discount,
            grandTotal
        },
        priceChanges
    };
};

/**
 * Add product + variant to Cart with validation checks
 */
const addToCart = async (userId, productId, variantId, quantity = 1) => {
    try {
        if (quantity < 1 || quantity > MAX_CART_QUANTITY) {
            return { success: false, message: `Quantity must be between 1 and ${MAX_CART_QUANTITY}.` };
        }

        // 1. Run centralized validation checks
        const check = await validateCartItem(productId, variantId);
        if (!check.isValid) {
            return { success: false, message: check.error };
        }

        const { product, variant } = check;

        // 2. Revalidate stock for concurrent updates
        if (variant.stock <= 0) {
            return { success: false, message: "This product variant is out of stock." };
        }

        if (quantity > variant.stock) {
            return { success: false, message: `Only ${variant.stock} items are available in stock.` };
        }

        let cart = await Cart.findOne({ user: userId });
        if (!cart) {
            cart = new Cart({ user: userId, items: [] });
        }

        // Check if the item already exists in the cart
        const existingItem = cart.items.find(
            item => item.product.toString() === productId.toString() && item.variantId.toString() === variantId.toString()
        );

        const variantName = `${variant.color} / ${variant.storage}`;
        const variantImg = (Array.isArray(variant.images) && variant.images.length > 0) ? variant.images[0] : fallbackSvg;

        if (existingItem) {
            const newQty = existingItem.quantity + quantity;
            
            // Stock limits checks
            if (newQty > variant.stock) {
                return { success: false, message: `Cannot add more. Only ${variant.stock} items are available in stock.` };
            }
            
            // Cart boundary checks
            if (newQty > MAX_CART_QUANTITY) {
                return { success: false, message: `You can only add a maximum of ${MAX_CART_QUANTITY} units of this item to your cart.` };
            }

            existingItem.quantity = newQty;
            existingItem.priceSnapshot = variant.salePrice; // Update to latest price
            existingItem.nameSnapshot = product.name;
            existingItem.imageSnapshot = variantImg;
            existingItem.variantSnapshot = variantName;
        } else {
            if (quantity > MAX_CART_QUANTITY) {
                return { success: false, message: `You can only add a maximum of ${MAX_CART_QUANTITY} units of this item to your cart.` };
            }
            
            cart.items.push({
                product: productId,
                variantId: variantId,
                quantity: quantity,
                priceSnapshot: variant.salePrice,
                nameSnapshot: product.name,
                imageSnapshot: variantImg,
                variantSnapshot: variantName
            });
        }

        await cart.save();

        // Wishlist Integration - Automatically remove from Wishlist
        try {
            await removeItemForCart(userId, productId, variantId);
        } catch (err) {
            console.error("Wishlist integration warning:", err);
        }

        const count = await getCartCount(userId);
        return { success: true, count, message: "Item added to cart successfully!" };
    } catch (error) {
        console.error("Cart Add Error:", error);
        return { success: false, message: error.message };
    }
};

/**
 * Update cart item quantity
 */
const updateQuantity = async (userId, productId, variantId, quantity) => {
    try {
        if (quantity < 1 || quantity > MAX_CART_QUANTITY) {
            return { success: false, message: `Quantity must be between 1 and ${MAX_CART_QUANTITY}.` };
        }

        // 1. Run centralized validation checks
        const check = await validateCartItem(productId, variantId);
        if (!check.isValid) {
            return { success: false, message: check.error };
        }

        const { variant } = check;

        // 2. Stock Revalidation (Concurrent update safe)
        if (variant.stock <= 0) {
            return { success: false, message: "This variant is currently out of stock." };
        }

        if (quantity > variant.stock) {
            return { success: false, message: `Only ${variant.stock} items are available in stock.` };
        }

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return { success: false, message: "Cart not found." };
        }

        const item = cart.items.find(
            i => i.product.toString() === productId.toString() && i.variantId.toString() === variantId.toString()
        );

        if (!item) {
            return { success: false, message: "Cart item not found." };
        }

        item.quantity = quantity;
        item.priceSnapshot = variant.salePrice; // Sync current price snapshot
        await cart.save();

        const refreshedCart = await getCart(userId);
        const count = await getCartCount(userId);

        return {
            success: true,
            count,
            cartSummary: refreshedCart.cartSummary,
            itemTotal: quantity * variant.salePrice
        };
    } catch (error) {
        console.error("Cart Update Error:", error);
        return { success: false, message: error.message };
    }
};

/**
 * Remove an item from the user's cart
 */
const removeItem = async (userId, productId, variantId) => {
    try {
        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return { success: false, message: "Cart not found." };
        }

        cart.items = cart.items.filter(
            i => !(i.product.toString() === productId.toString() && i.variantId.toString() === variantId.toString())
        );

        await cart.save();

        const refreshedCart = await getCart(userId);
        const count = await getCartCount(userId);

        return {
            success: true,
            count,
            cartSummary: refreshedCart.cartSummary
        };
    } catch (error) {
        console.error("Cart Remove Error:", error);
        return { success: false, message: error.message };
    }
};

export {
    getCartCount,
    getCart,
    addToCart,
    updateQuantity,
    removeItem
};
