import * as reviewService from "../services/reviewService.js";
import { validateReview } from "../validators/reviewValidator.js";

const createReview = async (req, res, next) => {
    try {
        const userId = req.session?.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in." });
        }

        const { rating, reviewText } = req.body;
        const { productId } = req.params;

        const validation = validateReview({ rating, reviewText });
        if (!validation.success) {
            return res.status(400).json({ success: false, errors: validation.errors });
        }

        const review = await reviewService.createReview(userId, productId, Number(rating), reviewText);
        const summary = await reviewService.getProductReviewsSummary(productId);

        return res.status(201).json({
            success: true,
            message: "Review submitted successfully",
            review,
            summary
        });
    } catch (error) {
        console.error("Create Review Controller Error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
};

const updateReview = async (req, res, next) => {
    try {
        const userId = req.session?.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in." });
        }

        const { rating, reviewText } = req.body;
        const { productId, reviewId } = req.params;

        const validation = validateReview({ rating, reviewText });
        if (!validation.success) {
            return res.status(400).json({ success: false, errors: validation.errors });
        }

        const review = await reviewService.updateReview(userId, reviewId, Number(rating), reviewText);
        const summary = await reviewService.getProductReviewsSummary(productId);

        return res.status(200).json({
            success: true,
            message: "Review updated successfully",
            review,
            summary
        });
    } catch (error) {
        console.error("Update Review Controller Error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
};

const deleteReview = async (req, res, next) => {
    try {
        const userId = req.session?.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in." });
        }

        const { productId, reviewId } = req.params;

        await reviewService.deleteReview(userId, reviewId);
        const summary = await reviewService.getProductReviewsSummary(productId);

        return res.status(200).json({
            success: true,
            message: "Review deleted successfully",
            summary
        });
    } catch (error) {
        console.error("Delete Review Controller Error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
};

const getProductReviews = async (req, res, next) => {
    try {
        const { productId } = req.params;
        const page = req.query.page || 1;

        const result = await reviewService.getProductReviews(productId, page);
        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error("Get Product Reviews Controller Error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
};

const getUserProductReview = async (req, res, next) => {
    try {
        const userId = req.session?.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in." });
        }

        const { productId } = req.params;
        const review = await reviewService.getUserProductReview(userId, productId);

        return res.status(200).json({
            success: true,
            review
        });
    } catch (error) {
        console.error("Get User Product Review Controller Error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
};

export {
    createReview,
    updateReview,
    deleteReview,
    getProductReviews,
    getUserProductReview
};
