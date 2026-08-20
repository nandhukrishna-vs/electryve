import express from "express";
import * as reviewController from "../controllers/reviewController.js";
import { isLoggedIn } from "../middlewares/userMiddleware.js";

const router = express.Router();

// Public routes
router.get("/product/:productId/reviews", reviewController.getProductReviews);

// Private routes (require authentication)
router.get(
    "/product/:productId/reviews/my-review",
    isLoggedIn,
    reviewController.getUserProductReview
);

router.post(
    "/product/:productId/reviews",
    isLoggedIn,
    reviewController.createReview
);

router.patch(
    "/product/:productId/reviews/:reviewId",
    isLoggedIn,
    reviewController.updateReview
);

router.delete(
    "/product/:productId/reviews/:reviewId",
    isLoggedIn,
    reviewController.deleteReview
);

export default router;
