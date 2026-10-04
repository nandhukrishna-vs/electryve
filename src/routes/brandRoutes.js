import express from "express";
import { isAdmin } from "../middlewares/adminMiddleware.js";


import {
  loadBrands,
  loadAddBrand,
  addBrand,
  loadEditBrand,
  editBrand,
  toggleBrandStatus,
  deleteBrand
} from "../controllers/brandController.js";

const router = express.Router();

router.get("/", isAdmin, loadBrands);

router.route("/add")
  .get(isAdmin, loadAddBrand)
  .post(isAdmin, addBrand);

router.route("/edit/:id")
  .get(isAdmin, loadEditBrand)
  .post(isAdmin, editBrand);

router.patch("/:id/toggle", isAdmin, toggleBrandStatus);

router.patch(
  "/:id/delete",
  isAdmin,
  deleteBrand
);

export default router;