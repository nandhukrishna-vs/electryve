import * as cartService from "../services/cartService.js";
import * as orderService from "../services/orderService.js";
import { validateUserCoupon } from "../services/couponService.js";
import Address from "../models/Address.js";
import Order from "../models/Order.js";

const loadCheckout = async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    // Load and validate cart
    const cart = await cartService.getCart(userId);
    if (!cart || cart.items.length === 0) {
      req.session.errorMessage = "Your cart is empty. Add products to cart first.";
      return res.redirect("/cart");
    }

    if (!cart.canCheckout) {
      req.session.errorMessage = "Some items in your cart are no longer available or out of stock.";
      return res.redirect("/cart");
    }

    // Load user addresses
    const addresses = await Address.find({ userId }).sort({ createdAt: -1 });

    // Find default address or first address
    let defaultAddress = addresses.find(addr => addr.isDefault);
    if (!defaultAddress && addresses.length > 0) {
      defaultAddress = addresses[0];
    }

    // Revalidate session-applied coupon against current cart
    let appliedCoupon = null;
    if (req.session.appliedCoupon?.code) {
      const subtotal = cart.cartSummary.subtotal;
      const couponValidation = await validateUserCoupon(userId, req.session.appliedCoupon.code, subtotal);
      if (couponValidation.success) {
        appliedCoupon = {
          code: couponValidation.coupon.code,
          discountAmount: couponValidation.discountAmount
        };
      } else {
        // Silently clear invalidated coupon (e.g. subtotal fell below minPurchase)
        delete req.session.appliedCoupon;
      }
    }

    res.render("user/checkout", {
      layout: "layouts/user-layout",
      title: "Checkout",
      cart,
      addresses,
      defaultAddress,
      appliedCoupon
    });
  } catch (error) {
    next(error);
  }
};

const addCheckoutAddress = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      landmark,
      city,
      state,
      pinCode,
      addressType,
      isDefault
    } = req.body;

    const existingAddressesCount = await Address.countDocuments({ userId });
    const makeDefault = existingAddressesCount === 0 || isDefault === true || isDefault === "true";

    if (makeDefault) {
      // Unset previous defaults
      await Address.updateMany({ userId }, { $set: { isDefault: false } });
    }

    const newAddress = new Address({
      userId,
      fullName: fullName.trim(),
      phone: phone.trim(),
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2?.trim() || "",
      landmark: landmark?.trim() || "",
      city: city.trim(),
      state: state.trim(),
      pinCode: Number(pinCode),
      addressType: addressType || "HOME",
      isDefault: makeDefault
    });

    await newAddress.save();

    res.json({
      success: true,
      message: "Address added successfully",
      address: newAddress
    });
  } catch (error) {
    console.error("Add Checkout Address Error:", error);
    res.status(500).json({ success: false, message: "Failed to add address." });
  }
};

const updateCheckoutAddress = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const addressId = req.params.id;
    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      landmark,
      city,
      state,
      pinCode,
      addressType,
      isDefault
    } = req.body;

    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found." });
    }

    const makeDefault = isDefault === true || isDefault === "true";
    if (makeDefault) {
      await Address.updateMany({ userId }, { $set: { isDefault: false } });
    }

    address.fullName = fullName.trim();
    address.phone = phone.trim();
    address.addressLine1 = addressLine1.trim();
    address.addressLine2 = addressLine2?.trim() || "";
    address.landmark = landmark?.trim() || "";
    address.city = city.trim();
    address.state = state.trim();
    address.pinCode = Number(pinCode);
    address.addressType = addressType || "HOME";
    address.isDefault = makeDefault;

    await address.save();

    res.json({
      success: true,
      message: "Address updated successfully",
      address
    });
  } catch (error) {
    console.error("Update Checkout Address Error:", error);
    res.status(500).json({ success: false, message: "Failed to update address." });
  }
};

const setDefaultAddress = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const addressId = req.params.id;

    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found." });
    }

    address.isDefault = true;
    await address.save();

    res.json({
      success: true,
      message: "Default address updated successfully"
    });
  } catch (error) {
    console.error("Set Default Address Error:", error);
    res.status(500).json({ success: false, message: "Failed to set default address." });
  }
};

const applyCoupon = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { couponCode } = req.body;

    if (!couponCode || !couponCode.trim()) {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required."
      });
    }

    const cart = await cartService.getCart(userId);
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Coupon cannot be applied to an empty cart."
      });
    }

    if (!cart.canCheckout) {
      return res.status(400).json({
        success: false,
        message: "Your cart contains unavailable or out-of-stock items."
      });
    }

    const subtotal = cart.cartSummary.subtotal;
    const result = await validateUserCoupon(userId, couponCode, subtotal);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    // Store minimal identifying information in session
    req.session.appliedCoupon = {
      code: result.coupon.code,
      couponId: result.coupon._id
    };

    const shippingCharge = cart.cartSummary.shipping;
    const finalAmount = Math.max(0, subtotal - result.discountAmount) + shippingCharge;

    return res.json({
      success: true,
      message: `Coupon "${result.coupon.code}" applied successfully! You saved ₹${result.discountAmount.toLocaleString("en-IN")}.`,
      couponCode: result.coupon.code,
      discountAmount: result.discountAmount,
      subtotal,
      shippingCharge,
      finalAmount
    });
  } catch (error) {
    console.error("Apply Coupon Controller Error:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while applying the coupon."
    });
  }
};

const removeCoupon = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    delete req.session.appliedCoupon;

    const cart = await cartService.getCart(userId);
    const subtotal = cart?.cartSummary?.subtotal || 0;
    const shippingCharge = cart?.cartSummary?.shipping || 0;
    const finalAmount = cart?.cartSummary?.grandTotal || (subtotal + shippingCharge);

    return res.json({
      success: true,
      message: "Coupon removed successfully.",
      subtotal,
      shippingCharge,
      finalAmount
    });
  } catch (error) {
    console.error("Remove Coupon Controller Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove coupon."
    });
  }
};

const placeCODOrder = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { addressId } = req.body;

    if (!addressId) {
      return res.status(400).json({ success: false, message: "Please select a delivery address." });
    }

    const couponCode = req.session.appliedCoupon?.code || null;
    const result = await orderService.createCODOrder(userId, addressId, couponCode);
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Clear applied coupon on successful order placement
    delete req.session.appliedCoupon;

    res.json(result);
  } catch (error) {
    next(error);
  }
};

const loadOrderSuccess = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { orderNumber } = req.query;

    if (!orderNumber) {
      return res.redirect("/shop");
    }

    const order = await Order.findOne({ orderNumber, user: userId });
    if (!order) {
      return res.redirect("/shop");
    }

    res.render("user/order-success", {
      layout: "layouts/user-layout",
      title: "Order Placed Successfully",
      order
    });
  } catch (error) {
    next(error);
  }
};

const loadOrderDetails = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const orderId = req.params.id;

    const order = await orderService.getOrderById(userId, orderId);
    if (!order) {
      req.session.errorMessage = "Order not found.";
      return res.redirect("/");
    }

    res.render("user/order-details", {
      layout: "layouts/user-layout",
      title: `Order Details - ${order.orderNumber}`,
      order
    });
  } catch (error) {
    next(error);
  }
};

export {
  loadCheckout,
  addCheckoutAddress,
  updateCheckoutAddress,
  setDefaultAddress,
  applyCoupon,
  removeCoupon,
  placeCODOrder,
  loadOrderSuccess,
  loadOrderDetails
};
