import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },

        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },

        reviewText: {
            type: String,
            required: true,
            trim: true
        },

        isDeleted: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

// Compound partial unique index to enforce "one active review per user per product"
reviewSchema.index(
    { user: 1, product: 1 },
    {
        unique: true,
        partialFilterExpression: {
            isDeleted: false
        }
    }
);

// Extra indexes for performance
reviewSchema.index({ product: 1, isDeleted: 1 });
reviewSchema.index({ user: 1 });

const Review = mongoose.model("Review", reviewSchema);

export default Review;
