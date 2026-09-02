import * as cartService from "../services/cartService.js";
import * as orderService from "../services/orderService.js";
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

    res.render("user/checkout", {
      layout: "layouts/user-layout",
      title: "Checkout",
      cart,
      addresses,
      defaultAddress
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

const placeCODOrder = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { addressId } = req.body;

    if (!addressId) {
      return res.status(400).json({ success: false, message: "Please select a delivery address." });
    }

    const result = await orderService.createCODOrder(userId, addressId);
    if (!result.success) {
      return res.status(400).json(result);
    }

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
  placeCODOrder,
  loadOrderSuccess,
  loadOrderDetails
};
