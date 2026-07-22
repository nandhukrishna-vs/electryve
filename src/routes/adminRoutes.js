import express from "express";

import {
  loadAdminLogin,
  adminLogin,
  adminLogout,
  loadUsers,
  toggleUserStatus
} from "../controllers/adminController.js";

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

router.get("/logout", isAdmin, adminLogout);

export default router;