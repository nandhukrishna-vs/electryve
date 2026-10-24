import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import session from "express-session";
import http from "http";
import userRoutes from "../src/routes/userRoutes.js";
import authRoutes from "../src/routes/authRoutes.js";
import { isLoggedIn } from "../src/middlewares/authMiddleware.js";
import * as userService from "../src/services/userService.js";
import User from "../src/models/User.js";
import Address from "../src/models/Address.js";

async function runTests() {
    console.log("=== ELECTRYVE PRE-HOSTING REGRESSION TEST SUITE ===");
    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  [PASS] ${message}`);
            passed++;
        } else {
            console.error(`  [FAIL] ${message}`);
            failed++;
        }
    }

    // TEST 1: Discount percentage edge-case math
    console.log("\n1. Testing Discount Percentage Math Edge Cases...");
    {
        function calcDiscount(regPrice, salePrice) {
            let discountPercentage = 0;
            if (regPrice > 0 && salePrice < regPrice) {
                const rawPercent = ((regPrice - salePrice) / regPrice) * 100;
                discountPercentage = Math.round(rawPercent);
                if (discountPercentage >= 100 && salePrice > 0) {
                    discountPercentage = 99;
                }
            }
            return discountPercentage;
        }

        // Test S22 Ultra extreme discount (regularPrice: 60000, salePrice: 15)
        const s22Discount = calcDiscount(60000, 15);
        assert(s22Discount === 99, `Discount for ₹15 on ₹60,000 is capped at 99% (got ${s22Discount}%)`);

        // Test normal discount
        const normalDiscount = calcDiscount(1000, 500);
        assert(normalDiscount === 50, `Discount for ₹500 on ₹1,000 is 50% (got ${normalDiscount}%)`);

        // Test no discount
        const noDiscount = calcDiscount(1000, 1000);
        assert(noDiscount === 0, `Discount for ₹1,000 on ₹1,000 is 0% (got ${noDiscount}%)`);

        // Test free product (salePrice: 0)
        const freeProduct = calcDiscount(1000, 0);
        assert(freeProduct === 100, `Discount for ₹0 on ₹1,000 is 100% (got ${freeProduct}%)`);
    }

    // TEST 2: Express routing & redirect alias tests using ephemeral HTTP server
    console.log("\n2. Testing Express Routes, Aliases & Middleware Responses...");
    {
        const app = express();
        app.use(express.json());
        app.use(session({
            secret: "test-secret-key",
            resave: false,
            saveUninitialized: false
        }));

        // Mock ejs render
        app.use((req, res, next) => {
            res.render = (view, data) => res.json({ renderedView: view, data });
            next();
        });

        app.use("/auth", authRoutes);
        app.use("/", userRoutes);

        const server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
            // Subtest A: Unauthenticated HTML request to /addresses redirects to /auth/login
            const htmlRes = await fetch(`${baseUrl}/addresses`, {
                headers: { "Accept": "text/html" },
                redirect: "manual"
            });
            assert(htmlRes.status === 302, `HTML GET /addresses returns HTTP 302 (got ${htmlRes.status})`);
            const htmlLocation = htmlRes.headers.get("location");
            assert(htmlLocation === "/auth/login", `HTML GET /addresses redirects to /auth/login (got ${htmlLocation})`);

            // Subtest B: Unauthenticated AJAX/JSON request to /addresses returns HTTP 401 JSON
            const jsonRes = await fetch(`${baseUrl}/addresses`, {
                headers: { "Accept": "application/json" },
                redirect: "manual"
            });
            assert(jsonRes.status === 401, `JSON GET /addresses returns HTTP 401 (got ${jsonRes.status})`);
            const jsonBody = await jsonRes.json();
            assert(jsonBody.success === false, `JSON GET /addresses returns success: false payload`);

            // Subtest C: Alias redirect /profile/addresses -> /addresses
            const profileAddrRes = await fetch(`${baseUrl}/profile/addresses`, {
                redirect: "manual"
            });
            assert(profileAddrRes.status === 301, `GET /profile/addresses returns 301 Permanent Redirect (got ${profileAddrRes.status})`);
            assert(profileAddrRes.headers.get("location") === "/addresses", `GET /profile/addresses redirects to /addresses`);

            // Subtest D: Alias redirect /login -> /auth/login
            const loginRes = await fetch(`${baseUrl}/login`, {
                redirect: "manual"
            });
            assert(loginRes.status === 301, `GET /login returns 301 Permanent Redirect (got ${loginRes.status})`);
            assert(loginRes.headers.get("location") === "/auth/login", `GET /login redirects to /auth/login`);

            // Subtest E: Alias redirect /signup -> /auth/signup
            const signupRes = await fetch(`${baseUrl}/signup`, {
                redirect: "manual"
            });
            assert(signupRes.status === 301, `GET /signup returns 301 Permanent Redirect (got ${signupRes.status})`);
            assert(signupRes.headers.get("location") === "/auth/signup", `GET /signup redirects to /auth/signup`);

        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    }

    // TEST 3: Database & Security Address ownership verification
    console.log("\n3. Testing Address Ownership & Validation Security...");
    const dbUri =
      process.env.TEST_MONGO_URI ||
      process.env.TEST_MONGODB_URI ||
      process.env.MONGODB_URI ||
      "mongodb://127.0.0.1:27017/electryve_test";
    try {
      await mongoose.connect(dbUri);
      console.log(`  Connected to MongoDB (${dbUri.split("/").pop()}).`);

            // Subtest A: Invalid ObjectId in updateAddress returns controlled errorResponse
            const resUpdate = await userService.updateAddress({
                params: { id: "invalid-id-xyz" },
                body: {},
                session: { user: { id: new mongoose.Types.ObjectId() } }
            });
            assert(resUpdate.success === false, `Invalid addressId in updateAddress safely returns success: false`);
            assert(resUpdate.message === "Address not found", `Invalid addressId message is 'Address not found'`);

            // Subtest B: Invalid ObjectId in deleteAddress returns controlled errorResponse
            const resDelete = await userService.deleteAddress({
                params: { id: "invalid-id-xyz" },
                session: { user: { id: new mongoose.Types.ObjectId() } }
            });
            assert(resDelete.success === false, `Invalid addressId in deleteAddress safely returns success: false`);
            assert(resDelete.message === "Address not found", `Invalid addressId message is 'Address not found'`);

            // Subtest C: Cross-user address deletion attempt
            const existingAddress = await Address.findOne();
            if (existingAddress) {
                const fakeUserId = new mongoose.Types.ObjectId();
                const crossDeleteRes = await userService.deleteAddress({
                    params: { id: String(existingAddress._id) },
                    session: { user: { id: fakeUserId } }
                });
                assert(crossDeleteRes.success === false, `Cross-user deleteAddress attempt rejected with success: false`);
                assert(crossDeleteRes.message === "Address not found", `Cross-user deletion rejected as unauthorized (got ${crossDeleteRes.message})`);

                // Verify address still exists
                const stillExists = await Address.findById(existingAddress._id);
                assert(stillExists !== null, `Address record preserved in database`);
            } else {
                console.log("  [SKIP] No address records in DB to test cross-user deletion");
            }

            await mongoose.disconnect();
        } catch (dbErr) {
            console.error("  MongoDB test error:", dbErr.message);
            failed++;
        }

    console.log(`\n========================================`);
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("Unhandled error in test runner:", err);
    process.exit(1);
});
