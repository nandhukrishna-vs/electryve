import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 50,
},

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"]
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
    },

    password: {
      type: String,
      default: null
    },

    authProvider: {
      type: String,
      enum: ["LOCAL", "GOOGLE"],
      default: "LOCAL"
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false
    },

    avatar: {
      type: String,
      default: ""
    },

    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER"
    },

    status: {
      type: String,
      enum: ["ACTIVE", "BLOCKED", "DELETED"],
      default: "ACTIVE"
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    referralCode: {
      type: String,
      unique: true,
      sparse: true
    },

    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);


userSchema.index({ status: 1 });
userSchema.index({ createdAt: -1 });

userSchema.virtual("isBlocked").get(function () {
  return this.status === "BLOCKED";
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;