import express from "express";
import * as reviewController from "../controllers/reviewController.js";
import { isLoggedIn } from "../middlewares/userMiddleware.js";

const router = express.Router();

// Public & Protected Product Reviews
router.route("/product/:productId/reviews")
    .get(reviewController.getProductReviews)
    .post(isLoggedIn, reviewController.createReview);

// Private routes (require authentication)
router.get(
    "/product/:productId/reviews/my-review",
    isLoggedIn,
    reviewController.getUserProductReview
);

router.route("/product/:productId/reviews/:reviewId")
    .patch(isLoggedIn, reviewController.updateReview)
    .delete(isLoggedIn, reviewController.deleteReview);

export default router;
