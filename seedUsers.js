import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcrypt";
import connectDB from "./src/config/db.js";
import User from "./src/models/User.js";

const seedUsers = async () => {

  try {

    await connectDB();

    const users = [];

    const hashedPassword = await bcrypt.hash("Password@123", 10);

    for (let i = 1; i <= 30; i++) {

      users.push({

        fullName: `Test User ${i}`,

        email: `testuser${i}@gmail.com`,

        phone: `900000${String(i).padStart(4, "0")}`,

        password: hashedPassword,

        authProvider: "LOCAL",

        isEmailVerified: true,

        avatar: "",

        role: "USER",

        status: "ACTIVE",

        referredBy: null,

        referralCode: `REF${100000 + i}`,

        lastLoginAt: null

      });

    }

    await User.insertMany(users);

    console.log("✅ 30 Dummy Users Created Successfully");

    process.exit();

  } catch (error) {

    console.error(error);

    process.exit();

  }

};

seedUsers();