import mongoose from "mongoose";

const referralProgramSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "DEFAULT_REFERRAL_PROGRAM",
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    referrerRewardAmount: {
      type: Number,
      required: true,
      default: 200,
      min: [0, "Referrer reward amount cannot be negative"]
    },
    referredUserRewardAmount: {
      type: Number,
      required: true,
      default: 200,
      min: [0, "Referred user reward amount cannot be negative"]
    },
    minimumOrderAmount: {
      type: Number,
      required: true,
      default: 1000,
      min: [0, "Minimum order amount cannot be negative"]
    },
    rewardTrigger: {
      type: String,
      enum: ["DELIVERED", "ORDER_DELIVERED"],
      default: "ORDER_DELIVERED"
    },
    maxSuccessfulReferralsPerUser: {
      type: Number,
      default: null,
      validate: {
        validator: function (v) {
          return v === null || (Number.isInteger(v) && v >= 1);
        },
        message: "Maximum successful referrals must be null or an integer greater than or equal to 1"
      }
    }
  },
  {
    timestamps: true
  }
);

/**
 * Singleton retrieval: retrieves the active program or initializes the default record.
 */
referralProgramSchema.statics.getProgram = async function () {
  return await this.findOneAndUpdate(
    { key: "DEFAULT_REFERRAL_PROGRAM" },
    {
      $setOnInsert: {
        key: "DEFAULT_REFERRAL_PROGRAM",
        isActive: true,
        referrerRewardAmount: 200,
        referredUserRewardAmount: 200,
        minimumOrderAmount: 1000,
        rewardTrigger: "ORDER_DELIVERED",
        maxSuccessfulReferralsPerUser: null
      }
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true
    }
  );
};

/**
 * Updates singleton program settings.
 */
referralProgramSchema.statics.updateProgram = async function (updates = {}) {
  let program = await this.getProgram();
  Object.assign(program, updates);
  await program.save();
  return program;
};

const ReferralProgram =
  mongoose.models.ReferralProgram ||
  mongoose.model("ReferralProgram", referralProgramSchema);

export default ReferralProgram;
