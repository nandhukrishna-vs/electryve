import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    subtitle: {
      type: String,
      default: "",
      trim: true
    },
    badge: {
      type: String,
      default: "Special Offer",
      trim: true
    },
    image: {
      type: String,
      required: true
    },
    ctaText: {
      type: String,
      default: "Shop Now",
      trim: true
    },
    ctaLink: {
      type: String,
      default: "/shop",
      trim: true
    },
    displayOrder: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    },
    startAt: {
      type: Date,
      default: null
    },
    expiryAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

bannerSchema.index({ isActive: 1, displayOrder: 1 });

const Banner = mongoose.models.Banner || mongoose.model("Banner", bannerSchema);

export default Banner;
