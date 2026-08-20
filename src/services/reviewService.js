import Review from "../models/Review.js";
import Product from "../models/Product.js";
import mongoose from "mongoose";

const getProductReviewsSummary = async (productId) => {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return {
            averageRating: 0,
            totalReviews: 0,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        };
    }

    const prodId = new mongoose.Types.ObjectId(productId);
    const stats = await Review.aggregate([
        { $match: { product: prodId, isDeleted: false } },
        { $group: {
            _id: "$rating",
            count: { $sum: 1 }
        }}
    ]);

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalReviews = 0;
    let totalRatingSum = 0;

    stats.forEach(item => {
        const rating = item._id;
        const count = item.count;
        if (rating >= 1 && rating <= 5) {
            distribution[rating] = count;
            totalReviews += count;
            totalRatingSum += rating * count;
        }
    });

    const averageRating = totalReviews > 0
        ? Math.round((totalRatingSum / totalReviews) * 10) / 10
        : 0;

    return {
        averageRating,
        totalReviews,
        ratingDistribution: distribution
    };
};

const createReview = async (userId, productId, rating, reviewText) => {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw new Error("Invalid Product ID");
    }

    const product = await Product.findOne({ _id: productId, isDeleted: false, isListed: true })
        .populate("category")
        .populate("brand");

    if (!product || 
        !product.category || product.category.isDeleted || !product.category.isListed || 
        !product.brand || product.brand.isDeleted || !product.brand.isListed) {
        throw new Error("Product is not available for review");
    }

    // Check if user already has a review for this product
    const existingReview = await Review.findOne({ user: userId, product: productId });
    
    if (existingReview) {
        if (existingReview.isDeleted) {
            // Restore and update soft-deleted review
            existingReview.isDeleted = false;
            existingReview.rating = rating;
            existingReview.reviewText = reviewText;
            await existingReview.save();
            return existingReview;
        } else {
            throw new Error("You have already reviewed this product. You can edit your existing review.");
        }
    }

    const review = new Review({
        user: userId,
        product: productId,
        rating,
        reviewText
    });

    await review.save();
    return review;
};

const updateReview = async (userId, reviewId, rating, reviewText) => {
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
        throw new Error("Invalid Review ID");
    }

    const review = await Review.findOne({ _id: reviewId, isDeleted: false });
    if (!review) {
        throw new Error("Review not found or has been deleted");
    }

    if (review.user.toString() !== userId.toString()) {
        throw new Error("Unauthorized to update this review");
    }

    review.rating = rating;
    review.reviewText = reviewText;
    await review.save();
    return review;
};

const deleteReview = async (userId, reviewId) => {
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
        throw new Error("Invalid Review ID");
    }

    const review = await Review.findOne({ _id: reviewId, isDeleted: false });
    if (!review) {
        throw new Error("Review not found");
    }

    if (review.user.toString() !== userId.toString()) {
        throw new Error("Unauthorized to delete this review");
    }

    review.isDeleted = true;
    await review.save();
    return review;
};

const getProductReviews = async (productId, page = 1) => {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw new Error("Invalid Product ID");
    }

    page = Math.max(1, parseInt(page) || 1);
    const limit = 5;
    const skip = (page - 1) * limit;

    const summary = await getProductReviewsSummary(productId);

    const reviews = await Review.find({ product: productId, isDeleted: false })
        .populate("user", "fullName avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    return {
        reviews,
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(summary.totalReviews / limit)),
        totalReviews: summary.totalReviews,
        averageRating: summary.averageRating,
        ratingDistribution: summary.ratingDistribution
    };
};

const getUserProductReview = async (userId, productId) => {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return null;
    }
    return await Review.findOne({ user: userId, product: productId, isDeleted: false }).lean();
};

export {
    getProductReviewsSummary,
    createReview,
    updateReview,
    deleteReview,
    getProductReviews,
    getUserProductReview
};
