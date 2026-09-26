import ejs from "ejs";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n==================================================");
  console.log("🚀 STARTING ADMIN REFERRAL PAGINATION TEST SUITE");
  console.log("==================================================\n");

  const templatePath = path.resolve("src/views/admin/referrals/index.ejs");
  assert(fs.existsSync(templatePath), `Template exists at ${templatePath}`);

  const templateStr = fs.readFileSync(templatePath, "utf-8");

  // Mock standard objects required by the template
  const mockAdminStats = {
    totalReferrals: 0,
    completedReferrals: 0,
    totalRewardsDistributed: 0,
    recoveryRequiredCount: 0,
    statusCounts: {
      PENDING: 0,
      FIRST_ORDER_PENDING: 0,
      ELIGIBLE_FOR_REWARD: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      REWARD_REVERSED: 0,
      RECOVERY_REQUIRED: 0
    }
  };

  const mockProgram = {
    isActive: true,
    referrerRewardAmount: 200,
    referredUserRewardAmount: 200,
    minimumOrderAmount: 1000
  };

  // --- Test Group 1: EJS Rendering with Zero Referrals (Edge Case) ---
  console.log("\n--- Test Group 1: EJS Rendering with Zero Referrals ---");
  try {
    const htmlZero = ejs.render(
      templateStr,
      {
        title: "Referral Management",
        referrals: [],
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
        limit: 15,
        pagination: {
          page: 1,
          limit: 15,
          totalCount: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        },
        adminStats: mockAdminStats,
        program: mockProgram,
        search: "",
        status: "",
        successMessage: null,
        errorMessage: null
      },
      { filename: templatePath }
    );

    assert(typeof htmlZero === "string", "Render succeeded without throwing any ReferenceError");
    assert(htmlZero.includes("No referral records found."), "Displays empty state message");
    assert(!htmlZero.includes("aria-label=\"Referral pagination\""), "Pagination bar is hidden when totalPages <= 1");
  } catch (err) {
    assert(false, `Rendering failed with error: ${err.message}`);
  }

  // --- Test Group 2: EJS Rendering with Multi-Page Referrals ---
  console.log("\n--- Test Group 2: EJS Rendering with Multi-Page Referrals ---");
  try {
    const mockReferrals = [
      {
        _id: new mongoose.Types.ObjectId(),
        referralCode: "ELEC1234",
        status: "COMPLETED",
        referrer: { fullName: "Alice Smith", email: "alice@test.com" },
        referredUser: { fullName: "Bob Jones", email: "bob@test.com", createdAt: new Date() },
        qualifyingOrder: { orderNumber: "ORD-9999", finalAmount: 1500, orderStatus: "DELIVERED" },
        referrerRewardAmountSnapshot: 200,
        referredUserRewardAmountSnapshot: 200,
        rewardProcessedAt: new Date()
      }
    ];

    const htmlMulti = ejs.render(
      templateStr,
      {
        title: "Referral Management",
        referrals: mockReferrals,
        currentPage: 2,
        totalPages: 3,
        totalCount: 35,
        limit: 15,
        pagination: {
          page: 2,
          limit: 15,
          totalCount: 35,
          totalPages: 3,
          hasNextPage: true,
          hasPrevPage: true
        },
        adminStats: mockAdminStats,
        program: mockProgram,
        search: "Alice",
        status: "COMPLETED",
        successMessage: "All good",
        errorMessage: null
      },
      { filename: templatePath }
    );

    assert(htmlMulti.includes("Alice Smith"), "Rendered referrer name");
    assert(htmlMulti.includes("ELEC1234"), "Rendered referral code");
    assert(htmlMulti.includes("aria-label=\"Referral pagination\""), "Pagination bar is visible when totalPages > 1");
    assert(htmlMulti.includes("Showing 16 to 30 of 35 referrals"), "Showing range calculation is accurate");
    assert(htmlMulti.includes("search=Alice"), "Search parameter preserved in pagination URLs");
    assert(htmlMulti.includes("status=COMPLETED"), "Status parameter preserved in pagination URLs");
    assert(htmlMulti.includes("page=1"), "Previous/page 1 link present");
    assert(htmlMulti.includes("page=3"), "Next/page 3 link present");
    assert(htmlMulti.includes("active"), "Active class rendered on current page");
  } catch (err) {
    assert(false, `Multi-page rendering failed with error: ${err.message}`);
  }

  // --- Test Group 3: Controller loadAdminReferrals Contract ---
  console.log("\n--- Test Group 3: Controller loadAdminReferrals Contract ---");
  try {
    const adminReferralController = await import("../src/controllers/adminReferralController.js");
    assert(typeof adminReferralController.loadAdminReferrals === "function", "loadAdminReferrals function exists");

    // Connect DB to test full controller execution if available
    const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/electryve";
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    let renderedView = null;
    let renderedData = null;

    const mockReq = {
      query: { page: "1", limit: "15", search: "", status: "" },
      session: {}
    };

    const mockRes = {
      render: (view, data) => {
        renderedView = view;
        renderedData = data;
      },
      redirect: () => {},
      json: () => {}
    };

    let nextError = null;
    await adminReferralController.loadAdminReferrals(mockReq, mockRes, (err) => {
      nextError = err;
    });

    assert(nextError === null, "Controller executed without throwing error");
    assert(renderedView === "admin/referrals/index", "Render target is admin/referrals/index");
    assert(typeof renderedData.totalPages === "number", `totalPages is defined as number: ${renderedData.totalPages}`);
    assert(typeof renderedData.currentPage === "number", `currentPage is defined as number: ${renderedData.currentPage}`);
    assert(typeof renderedData.totalCount === "number", `totalCount is defined as number: ${renderedData.totalCount}`);
    assert(renderedData.limit === 15, `limit is 15: ${renderedData.limit}`);
    assert(Array.isArray(renderedData.referrals), "referrals is an array");
    assert(typeof renderedData.pagination === "object", "pagination object is provided");
    assert(renderedData.title === "Referral Management", "Title is Referral Management");
  } catch (err) {
    assert(false, `Controller test failed with error: ${err.message}`);
  }

  // --- Test Group 4: referralService.getAdminReferrals Service Contract ---
  console.log("\n--- Test Group 4: referralService.getAdminReferrals Service Contract ---");
  try {
    const referralService = await import("../src/services/referralService.js");
    assert(typeof referralService.getAdminReferrals === "function", "getAdminReferrals function exists");

    const result = await referralService.getAdminReferrals({ page: 1, limit: 15 });
    assert(Array.isArray(result.referrals), "result.referrals is an array");
    assert(typeof result.totalCount === "number", "result.totalCount is a number");
    assert(typeof result.totalPages === "number", "result.totalPages is a number");
    assert(typeof result.currentPage === "number", "result.currentPage is a number");
    assert(typeof result.limit === "number", "result.limit is a number");
    assert(typeof result.pagination === "object", "result.pagination is an object");
    assert(result.pagination.limit === 15, "default limit in service is 15");
  } catch (err) {
    assert(false, `Service test failed with error: ${err.message}`);
  }

  console.log("\n==================================================");
  console.log(`FINAL RESULT: ${passed} passed, ${failed} failed`);
  console.log("==================================================\n");

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Unhandled test runner error:", err);
  process.exit(1);
});
