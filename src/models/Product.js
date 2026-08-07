import mongoose from "mongoose";

const variantSchema = new mongoose.Schema(
    {
        color: {
            type: String,
            required: true,
            trim: true
        },

        storage: {
            type: String,
            required: true,
            trim: true
        },

        sku: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true
        },

        regularPrice: {
            type: Number,
            required: true,
            min: 0
        },

        salePrice: {
            type: Number,
            required: true,
            min: 0
        },

        stock: {
            type: Number,
            required: true,
            default: 0,
            min: 0
        },

        images: {
            type: [String],
            validate: {
                validator: function (images) {
                    return images.length >= 3 && images.length <= 5;
                },
                message: "Each variant must have between 3 and 5 images."
            }
        },

        isListed: {
            type: Boolean,
            default: true
        }

    },
    {
        _id: true
    }
);

const specificationSchema = new mongoose.Schema(
    {
        processor: String,

        ram: String,

        display: String,

        battery: String,

        camera: String,

        operatingSystem: String,

        warranty: String
    },
    {
        _id: false
    }
);

const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        slug: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        description: {
            type: String,
            required: true,
            trim: true
        },

        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: true
        },

        brand: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Brand",
            required: true
        },

        specifications: {
            type: specificationSchema,
            default: {}
        },

        variants: {
            type: [variantSchema],
            required: true,
            validate: {
                validator: function (variants) {
                    return variants.length > 0;
                },
                message: "At least one variant is required."
            }
        },

        isFeatured: {
            type: Boolean,
            default: false
        },

        isListed: {
            type: Boolean,
            default: true
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

/* =======================
   Virtual Total Stock
======================= */

productSchema.virtual("totalStock").get(function () {

    return this.variants.reduce((total, variant) => {

        return total + variant.stock;

    }, 0);

});

/* =======================
   Indexes
======================= */

productSchema.index({ slug: 1 });

productSchema.index({ category: 1 });

productSchema.index({ brand: 1 });

productSchema.index({ isListed: 1 });

productSchema.index({ isDeleted: 1 });

productSchema.index({ createdAt: -1 });

export default mongoose.model("Product", productSchema);