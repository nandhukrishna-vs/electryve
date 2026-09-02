import express from "express";

import {
  loadAdminLogin,
  adminLogin,
  adminLogout,
  loadUsers,
  toggleUserStatus
} from "../controllers/adminController.js";
import * as adminOrderController from "../controllers/adminOrderController.js";

import { isAdmin } from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.get("/login", loadAdminLogin);
router.post("/login", adminLogin);

router.get("/dashboard", isAdmin, (req, res) => {
  res.render("admin/dashboard", {
    layout: "layouts/admin-layout"
  });
});

router.get("/users", isAdmin, loadUsers);

router.patch(
  "/users/:id/toggle",
  isAdmin,
  toggleUserStatus
);

// Order Management Routes
router.get("/orders", isAdmin, adminOrderController.loadAdminOrders);
router.get("/orders/:id", isAdmin, adminOrderController.loadAdminOrderDetails);
router.patch("/orders/:id/status", isAdmin, adminOrderController.updateOrderStatus);
router.patch("/orders/:id/cancel", isAdmin, adminOrderController.cancelOrder);
router.patch("/orders/:id/items/:itemId/cancel", isAdmin, adminOrderController.cancelOrderItem);
router.patch("/orders/:id/items/:itemId/return", isAdmin, adminOrderController.returnOrderItem);
router.patch("/orders/:id/return", isAdmin, adminOrderController.returnOrder);
router.get("/orders/:id/invoice", isAdmin, adminOrderController.downloadInvoice);

router.get("/logout", isAdmin, adminLogout);

export default router;