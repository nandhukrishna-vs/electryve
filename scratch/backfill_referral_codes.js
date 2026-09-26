import mongoose from "mongoose";
import * as dotenv from "dotenv";
dotenv.config();

import User from "../src/models/User.js";
import crypto from "crypto";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/electryve";
const REFERRAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

function generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += REFERRAL_ALPHABET[bytes[i] % REFERRAL_ALPHABET.length];
  }
  return code;
}

async function backfill() {
  console.log("Starting Referral Code Backfill Migration...");
  await mongoose.connect(MONGO_URI);

  const usersWithoutCode = await User.find({
    $or: [
      { referralCode: null },
      { referralCode: { $exists: false } },
      { referralCode: "" }
    ]
  });

  console.log(`Found ${usersWithoutCode.length} users requiring referral code backfill.`);

  let updatedCount = 0;
  for (const user of usersWithoutCode) {
    let saved = false;
    let attempts = 0;
    while (!saved && attempts < 10) {
      attempts++;
      const code = generateCode();
      const existing = await User.findOne({ referralCode: code });
      if (!existing) {
        try {
          user.referralCode = code;
          await user.save();
          saved = true;
          updatedCount++;
          console.log(`  Assigned ${code} to user ${user.email} (${user._id})`);
        } catch (err) {
          if (err.code !== 11000) throw err;
        }
      }
    }
  }

  console.log(`Backfill completed. ${updatedCount} users updated.`);
  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
