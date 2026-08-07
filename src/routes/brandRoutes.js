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

router.get("/add", isAdmin, loadAddBrand);

router.post("/add", isAdmin, addBrand);

router.get("/edit/:id", isAdmin, loadEditBrand);

router.post("/edit/:id", isAdmin, editBrand);

router.patch("/:id/toggle", isAdmin, toggleBrandStatus);

router.patch(
  "/:id/delete",
  isAdmin,
  deleteBrand
);

export default router;