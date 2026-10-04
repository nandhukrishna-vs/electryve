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

router.route("/add")
  .get(isAdmin, loadAddCategory)
  .post(isAdmin, addCategory);

router.route("/edit/:id")
  .get(isAdmin, loadEditCategory)
  .post(isAdmin, editCategory);

router.patch("/:id/toggle", isAdmin, toggleCategoryStatus);

router.patch(
  "/:id/delete",
  isAdmin,
  deleteCategory
);

export default router;