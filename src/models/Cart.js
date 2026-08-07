import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        variantId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
            default: 1
        },
        priceSnapshot: {
            type: Number,
            required: true
        },
        nameSnapshot: {
            type: String,
            required: true
        },
        imageSnapshot: {
            type: String,
            required: true
        },
        variantSnapshot: {
            type: String,
            required: true
        },
        addedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        _id: false
    }
);

const cartSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true
        },
        items: [cartItemSchema]
    },
    {
        timestamps: true
    }
);

export default mongoose.model("Cart", cartSchema);
