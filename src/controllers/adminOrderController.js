import * as orderService from "../services/orderService.js";

const loadAdminOrders = async (req, res, next) => {
  try {
    const { search, page, status } = req.query;
    const orderData = await orderService.getAdminOrders({
      search,
      page,
      limit: 10,
      status
    });

    res.render("admin/orders/list", {
      layout: "layouts/admin-layout",
      title: "Order Management",
      ...orderData,
      query: req.query
    });
  } catch (error) {
    console.error("Admin Load Orders Error:", error);
    next(error);
  }
};

const loadAdminOrderDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await orderService.getAdminOrderById(id);

    if (!order) {
      req.session.errorMessage = "Order not found.";
      return res.redirect("/admin/orders");
    }

    res.render("admin/orders/details", {
      layout: "layouts/admin-layout",
      title: `Order Details - ${order.orderNumber}`,
      order
    });
  } catch (error) {
    console.error("Admin Load Order Details Error:", error);
    next(error);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required." });
    }

    const result = await orderService.updateOrderStatus(id, status);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error("Admin Update Order Status Error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update order status." });
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await orderService.cancelOrder(id, reason);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error("Admin Cancel Order Error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to cancel order." });
  }
};

const cancelOrderItem = async (req, res, next) => {
  try {
    const { id, itemId } = req.params;
    const { reason } = req.body;

    const result = await orderService.cancelOrderItem(id, itemId, reason);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error("Admin Cancel Order Item Error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to cancel item." });
  }
};

const approveReturnRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await orderService.approveReturnRequest(id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error("Admin Approve Return Request Error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to approve return request." });
  }
};

const rejectReturnRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const result = await orderService.rejectReturnRequest(id, rejectionReason);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error("Admin Reject Return Request Error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to reject return request." });
  }
};

export {
  loadAdminOrders,
  loadAdminOrderDetails,
  updateOrderStatus,
  cancelOrder,
  cancelOrderItem,
  approveReturnRequest,
  rejectReturnRequest
};
