import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 50
    },
    addressType: {
      type: String,
      enum: ["HOME", "OFFICE", "OTHER"],
      default: "HOME"
    },

    phone: {
      type: String,
      required: true,
      match: [/^[0-9]{10}$/, "Phone number must be 10 digits"]
    },

    addressLine1: {
      type: String,
      required: true,
      trim: true
    },

    addressLine2: {
      type: String,
      default: "",
      trim: true
    },

    landmark: {
      type: String,
      default: "",
      trim: true
    },

    city: {
      type: String,
      required: true,
      trim: true
    },

    state: {
      type: String,
      required: true,
      trim: true
    },

    pinCode: {
      type: Number,
      required: true
    },

    country: {
      type: String,
      required: true,
      default: "India"
    },

    isDefault: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

addressSchema.index({ userId: 1 });
addressSchema.index({ userId: 1, isDefault: 1 });

addressSchema.pre("save", async function () {

  if (!this.isDefault) {
    return;
  }

  await mongoose.model("Address").updateMany(
    {
      userId: this.userId,
      _id: { $ne: this._id }
    },
    {
      $set: {
        isDefault: false
      }
    }
  );

});

const Address = mongoose.model("Address", addressSchema);

export default Address;