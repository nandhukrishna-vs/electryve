import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  brandName: {
    type: String,
    required: true
  },
  variantDetails: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  regularPrice: {
    type: Number,
    required: true
  },
  salePrice: {
    type: Number,
    required: true
  },
  itemTotal: {
    type: Number,
    required: true
  },
  itemStatus: {
    type: String,
    enum: ["ACTIVE", "CANCELLED", "RETURNED"],
    default: "ACTIVE"
  },
  cancellationReason: {
    type: String,
    default: ""
  },
  cancelledAt: {
    type: Date
  },
  returnReason: {
    type: String,
    default: ""
  },
  returnedAt: {
    type: Date
  },
  isStockRestored: {
    type: Boolean,
    default: false
  }
});

const shippingAddressSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  addressLine1: {
    type: String,
    required: true
  },
  addressLine2: {
    type: String,
    default: ""
  },
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  pinCode: {
    type: Number,
    required: true
  },
  landmark: {
    type: String,
    default: ""
  }
});

const couponSnapshotSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon"
    },
    code: {
      type: String,
      uppercase: true,
      trim: true
    },
    discountType: {
      type: String,
      enum: ["PERCENTAGE", "FIXED"]
    },
    discountValue: {
      type: Number
    },
    discountAmount: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    orderNumber: {
      type: String,
      required: true,
      unique: true
    },
    items: [orderItemSchema],
    shippingAddress: shippingAddressSchema,
    subtotal: {
      type: Number,
      required: true
    },
    discount: {
      type: Number,
      required: true,
      default: 0
    },
    coupon: {
      type: couponSnapshotSchema,
      default: null
    },
    couponDiscount: {
      type: Number,
      default: 0
    },
    tax: {
      type: Number,
      required: true,
      default: 0
    },
    shippingCharge: {
      type: Number,
      required: true,
      default: 0
    },
    finalAmount: {
      type: Number,
      required: true
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["COD"],
      default: "COD"
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      default: "PENDING"
    },
    orderStatus: {
      type: String,
      required: true,
      enum: ["PLACED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED"],
      default: "PLACED"
    },
    cancellationReason: {
      type: String,
      default: ""
    },
    cancelledAt: {
      type: Date
    },
    returnReason: {
      type: String,
      default: ""
    },
    returnedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

orderSchema.index({ user: 1 });
orderSchema.index({ user: 1, "coupon.couponId": 1 });

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
export default Order;
