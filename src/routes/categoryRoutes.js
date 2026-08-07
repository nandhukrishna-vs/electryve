import express from "express";
import { isAdmin } from "../middlewares/adminMiddleware.js";

import {
  loadAdminLogin,
  adminLogin,
  adminLogout,
  loadUsers,
  toggleUserStatus
} from "../controllers/adminController.js";

import {
  loadCategories,
  loadAddCategory,
  addCategory,
  loadEditCategory,
  editCategory,
  toggleCategoryStatus,
  deleteCategory
} from "../controllers/categoryController.js";

const router = express.Router();

router.get("/", isAdmin, loadCategories);

router.get("/add", isAdmin, loadAddCategory);

router.post("/add", isAdmin, addCategory);

router.get("/edit/:id", isAdmin, loadEditCategory);

router.post("/edit/:id", isAdmin, editCategory);

router.patch("/:id/toggle", isAdmin, toggleCategoryStatus);

router.patch(
  "/:id/delete",
  isAdmin,
  deleteCategory
);

export default router;