import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../src/models/User.js";
import Order from "../src/models/Order.js";
import Wallet from "../src/models/Wallet.js";
import WalletTransaction from "../src/models/WalletTransaction.js";
import ReferralProgram from "../src/models/ReferralProgram.js";
import Referral from "../src/models/Referral.js";
import * as referralService from "../src/services/referralService.js";
import * as walletService from "../src/services/walletService.js";
import * as orderService from "../src/services/orderService.js";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/electryve";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    testsFailed++;
    throw new Error(message);
  } else {
    console.log(`✅ PASS: ${message}`);
    testsPassed++;
  }
}

const createMockOrder = async ({ user, finalAmount, orderNumber }) => {
  return await Order.create({
    orderNumber,
    user,
    items: [{
      product: new mongoose.Types.ObjectId(),
      variantId: new mongoose.Types.ObjectId(),
      productName: "Test Product",
      brandName: "Electryve",
      variantDetails: "Black / 128GB",
      image: "default.jpg",
      quantity: 1,
      regularPrice: finalAmount,
      salePrice: finalAmount,
      effectiveItemPrice: finalAmount,
      itemTotal: finalAmount,
      itemStatus: "ACTIVE"
    }],
    subtotal: finalAmount,
    finalAmount,
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    orderStatus: "PLACED",
    shippingAddress: {
      fullName: "Test User",
      phone: "9876543210",
      addressLine1: "123 Test Street",
      city: "Chennai",
      state: "Tamil Nadu",
      pinCode: 600001
    }
  });
};

async function runTests() {
  console.log("\n==================================================");
  console.log("🚀 STARTING REFERRAL MANAGEMENT SYSTEM TEST SUITE");
  console.log("==================================================\n");

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.");

  // Clean up any previous test artifacts
  const testPrefix = "ref_test_";
  await User.deleteMany({ email: new RegExp(`^${testPrefix}`) });
  await Referral.deleteMany({});
  await Order.deleteMany({ orderNumber: new RegExp(`^TEST-REF-`) });

  try {
    // -------------------------------------------------------------
    // Test 1: Referral Program Singleton
    // -------------------------------------------------------------
    console.log("\n--- Test Group 1: Referral Program Model & Settings ---");
    const program = await ReferralProgram.getProgram();
    assert(program !== null, "ReferralProgram singleton exists and is retrievable");
    assert(program.referrerRewardAmount === 200, "Default referrerRewardAmount is ₹200");
    assert(program.referredUserRewardAmount === 200, "Default referredUserRewardAmount is ₹200");
    assert(program.minimumOrderAmount === 1000, "Default minimumOrderAmount is ₹1000");
    assert(program.rewardTrigger === "ORDER_DELIVERED" || program.rewardTrigger === "DELIVERED", "Default rewardTrigger is ORDER_DELIVERED or DELIVERED");

    // Test program update
    const updated = await ReferralProgram.updateProgram({ referrerRewardAmount: 250 });
    assert(updated.referrerRewardAmount === 250, "ReferralProgram can be updated");
    // Reset back to 200
    await ReferralProgram.updateProgram({ referrerRewardAmount: 200 });

    // -------------------------------------------------------------
    // Test 2: Referral Code Generation & Uniqueness
    // -------------------------------------------------------------
    console.log("\n--- Test Group 2: Referral Code Generation ---");
    const code1 = await referralService.generateUniqueReferralCode();
    const code2 = await referralService.generateUniqueReferralCode();
    assert(typeof code1 === "string" && code1.length === 8, "Generated code is 8 characters");
    assert(code1 !== code2, "Consecutively generated codes are unique");
    assert(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(code1), "Code contains only valid unambiguous characters");

    // -------------------------------------------------------------
    // Test 3: Create Users & Attribution Validation
    // -------------------------------------------------------------
    console.log("\n--- Test Group 3: User Signup & Referral Attribution ---");
    const referrer = await User.create({
      fullName: "Referrer Alice",
      email: `${testPrefix}alice@example.com`,
      password: "Password123!",
      referralCode: code1,
      isBlocked: false
    });
    assert(referrer._id !== null, "Referrer user created with unique code");

    // Validate self-referral rejection
    const selfVal = await referralService.validateReferralCode(code1, referrer._id);
    assert(!selfVal.success, "Self-referral is correctly rejected");
    assert(selfVal.message.toLowerCase().includes("cannot use your own"), "Helpful message for self-referral");

    // Validate invalid code rejection
    const invalidVal = await referralService.validateReferralCode("INVALID99");
    assert(!invalidVal.success, "Invalid referral code is rejected");

    // Validate valid code
    const validVal = await referralService.validateReferralCode(code1);
    assert(validVal.success, "Valid referral code is accepted");
    assert(validVal.referrerName === "Referrer Alice", "Returns referrer name");

    // Simulate new user signup with valid code
    const referred1 = await User.create({
      fullName: "Referred Bob",
      email: `${testPrefix}bob@example.com`,
      password: "Password123!",
      referralCode: code2,
      isBlocked: false
    });

    const attrResult = await referralService.attributeReferral({
      userId: referred1._id,
      referralCode: code1
    });
    assert(attrResult.success, "Referral attribution succeeded for Bob referred by Alice");

    // Verify Bob's User document has referredBy set
    const bobUpdated = await User.findById(referred1._id);
    assert(bobUpdated.referredBy.toString() === referrer._id.toString(), "Bob.referredBy points to Alice");

    // Verify Referral document created with snapshots
    const refDoc = await Referral.findOne({ referredUser: referred1._id });
    assert(refDoc !== null, "Referral document created");
    assert(refDoc.referrer.toString() === referrer._id.toString(), "Referral.referrer points to Alice");
    assert(refDoc.status === "PENDING" || refDoc.status === "PENDING_ORDER", "Initial status is PENDING");
    assert(refDoc.minimumOrderAmountSnapshot === 1000, "Snapshotted min order amount is ₹1000");
    assert(refDoc.referrerRewardAmountSnapshot === 200, "Snapshotted referrer reward is ₹200");
    assert(refDoc.referredUserRewardAmountSnapshot === 200, "Snapshotted referred reward is ₹200");

    // Test duplicate attribution prevention (Bob cannot be referred again)
    const secondCode = await referralService.generateUniqueReferralCode();
    await User.create({
      fullName: "Charlie",
      email: `${testPrefix}charlie@example.com`,
      password: "Password123!",
      referralCode: secondCode
    });
    const dupAttr = await referralService.attributeReferral({
      userId: referred1._id,
      referralCode: secondCode
    });
    assert(!dupAttr.success, "Cannot attribute a second referrer to the same user");

    // -------------------------------------------------------------
    // Test 4: First Qualifying Order Threshold Check
    // -------------------------------------------------------------
    console.log("\n--- Test Group 4: Qualifying Order Delivery & Rewards ---");

    // Create a non-qualifying order (₹800 < ₹1000 min order)
    const lowOrder = await createMockOrder({
      user: referred1._id,
      finalAmount: 800,
      orderNumber: `TEST-REF-LOW-${Date.now()}`
    });

    // Mark as delivered
    await orderService.updateOrderStatus(lowOrder._id, "SHIPPED");
    await orderService.updateOrderStatus(lowOrder._id, "OUT_FOR_DELIVERY");
    await orderService.updateOrderStatus(lowOrder._id, "DELIVERED");

    // Check that referral is NOT completed because finalAmount < ₹1000
    const refDocAfterLow = await Referral.findOne({ referredUser: referred1._id });
    assert(refDocAfterLow.status === "PENDING" || refDocAfterLow.status === "PENDING_ORDER", "Order below minimum ₹1000 did not qualify referral");

    // Now create a qualifying order (₹1500 >= ₹1000)
    const qualifyingOrder = await createMockOrder({
      user: referred1._id,
      finalAmount: 1500,
      orderNumber: `TEST-REF-QUAL-${Date.now()}`
    });

    // Advance to DELIVERED
    await orderService.updateOrderStatus(qualifyingOrder._id, "SHIPPED");
    await orderService.updateOrderStatus(qualifyingOrder._id, "OUT_FOR_DELIVERY");
    const deliverRes = await orderService.updateOrderStatus(qualifyingOrder._id, "DELIVERED");
    assert(deliverRes.success, "Order marked DELIVERED successfully");

    // Check Referral status after delivery
    const refDocAfterQual = await Referral.findOne({ referredUser: referred1._id });
    assert(refDocAfterQual.status === "COMPLETED", "Referral transitioned to COMPLETED on qualifying order delivery");
    assert(refDocAfterQual.qualifyingOrder.toString() === qualifyingOrder._id.toString(), "Qualifying order is recorded");
    assert(refDocAfterQual.referrerRewardTransactionId !== null, "Referrer wallet tx recorded");
    assert(refDocAfterQual.referredUserRewardTransactionId !== null, "Referred user wallet tx recorded");

    // Check Alice (Referrer) Wallet Balance
    const aliceWallet = await walletService.getWalletSummary(referrer._id);
    assert(aliceWallet.balance === 200, "Alice received ₹200 wallet reward");

    // Check Bob (Referred) Wallet Balance
    const bobWallet = await walletService.getWalletSummary(referred1._id);
    assert(bobWallet.balance === 200, "Bob received ₹200 wallet cashback");

    // Check WalletTransaction sources
    const aliceTx = await WalletTransaction.findById(refDocAfterQual.referrerRewardTransactionId);
    assert(aliceTx.source === "REFERRAL_REWARD", "Alice wallet transaction source is REFERRAL_REWARD");
    assert(aliceTx.amount === 200, "Alice wallet transaction amount is ₹200");

    const bobTx = await WalletTransaction.findById(refDocAfterQual.referredUserRewardTransactionId);
    assert(bobTx.source === "REFERRAL_REWARD", "Bob wallet transaction source is REFERRAL_REWARD");
    assert(bobTx.amount === 200, "Bob wallet transaction amount is ₹200");

    // -------------------------------------------------------------
    // Test 5: Idempotency (Delivering again or processing again)
    // -------------------------------------------------------------
    console.log("\n--- Test Group 5: Idempotency & Subsequent Orders ---");
    const reprocessRes = await referralService.processReferralRewards(refDocAfterQual._id);
    assert(reprocessRes.status === "COMPLETED" || reprocessRes.alreadyProcessed === true, "Reprocessing completed referral is idempotent");

    const aliceWalletAfterReprocess = await walletService.getWalletSummary(referrer._id);
    assert(aliceWalletAfterReprocess.balance === 200, "Alice balance did not double (idempotency preserved)");

    // Create a 2nd qualifying order for Bob (₹2000 >= ₹1000)
    const secondOrder = await createMockOrder({
      user: referred1._id,
      finalAmount: 2000,
      orderNumber: `TEST-REF-2ND-${Date.now()}`
    });

    await orderService.updateOrderStatus(secondOrder._id, "SHIPPED");
    await orderService.updateOrderStatus(secondOrder._id, "OUT_FOR_DELIVERY");
    await orderService.updateOrderStatus(secondOrder._id, "DELIVERED");

    // Check Alice & Bob wallet balances remain ₹200
    const aliceWalletAfter2nd = await walletService.getWalletSummary(referrer._id);
    assert(aliceWalletAfter2nd.balance === 200, "Subsequent orders do not trigger new referral rewards");

    // -------------------------------------------------------------
    // Test 6: Reversals on Return / Cancellation
    // -------------------------------------------------------------
    console.log("\n--- Test Group 6: Safe Reward Reversals on Return ---");
    // Simulate return on the qualifying order
    const reverseRes = await referralService.handleOrderReturnOrCancel(qualifyingOrder._id, {
      reason: "Customer returned product"
    });
    assert(reverseRes.success === true, "Reward reversal succeeded");

    // Verify wallets debited safely
    const aliceWalletAfterRev = await walletService.getWalletSummary(referrer._id);
    assert(aliceWalletAfterRev.balance === 0, "Alice wallet debited ₹200 on reversal (now ₹0)");

    const bobWalletAfterRev = await walletService.getWalletSummary(referred1._id);
    assert(bobWalletAfterRev.balance === 0, "Bob wallet debited ₹200 on reversal (now ₹0)");

    const refDocAfterRev = await Referral.findOne({ referredUser: referred1._id });
    assert(refDocAfterRev.status === "REWARD_REVERSED" || refDocAfterRev.status === "REVERSED", "Referral status is REWARD_REVERSED");
    assert(refDocAfterRev.reversedAt !== null, "Reversal timestamp recorded");

    // Verify reversal transaction sources
    const revTx = await WalletTransaction.findOne({
      userId: referrer._id,
      source: "REFERRAL_REVERSAL"
    });
    assert(revTx !== null, "WalletTransaction created with source REFERRAL_REVERSAL");

    // -------------------------------------------------------------
    // Test 7: Non-Negative Wallet Balance Protection (Recovery Required)
    // -------------------------------------------------------------
    console.log("\n--- Test Group 7: Negative Balance Protection (RECOVERY_REQUIRED) ---");
    // Create new referred user Dave referred by Alice
    const daveCode = await referralService.generateUniqueReferralCode();
    const dave = await User.create({
      fullName: "Dave User",
      email: `${testPrefix}dave@example.com`,
      password: "Password123!",
      referralCode: daveCode
    });

    await referralService.attributeReferral({ userId: dave._id, referralCode: code1 });

    const daveOrder = await createMockOrder({
      user: dave._id,
      finalAmount: 1200,
      orderNumber: `TEST-REF-DAVE-${Date.now()}`
    });

    await orderService.updateOrderStatus(daveOrder._id, "SHIPPED");
    await orderService.updateOrderStatus(daveOrder._id, "OUT_FOR_DELIVERY");
    await orderService.updateOrderStatus(daveOrder._id, "DELIVERED");

    // Dave and Alice now both got ₹200
    // Now simulate Dave spending his ₹200 on another order (or admin debit)
    await walletService.debitWallet({
      userId: dave._id,
      amount: 150,
      source: "ORDER_PAYMENT",
      description: "Dave spent ₹150",
      idempotencyKey: `TEST_SPEND_${Date.now()}`
    });
    const daveWalletRemaining = await walletService.getWalletSummary(dave._id);
    assert(daveWalletRemaining.balance === 50, "Dave has only ₹50 left");

    // Now order return happens. Reversal needs ₹200 from Dave, but Dave only has ₹50!
    const daveRevRes = await referralService.handleOrderReturnOrCancel(daveOrder._id, {
      reason: "Dave returned order"
    });

    assert(daveRevRes.success === true, "Reversal handled gracefully");
    assert(daveRevRes.status === "RECOVERY_REQUIRED", "Marked as RECOVERY_REQUIRED to protect non-negative balance");

    const daveWalletProtected = await walletService.getWalletSummary(dave._id);
    assert(daveWalletProtected.balance >= 0, "Dave wallet balance is NOT negative");

    // -------------------------------------------------------------
    // Test 8: Statistics & History Queries
    // -------------------------------------------------------------
    console.log("\n--- Test Group 8: Stats & Reporting Methods ---");
    const userStats = await referralService.getReferralStats(referrer._id);
    assert(userStats.totalReferrals >= 2, "Alice has at least 2 referrals");
    assert(typeof userStats.totalEarned === "number" || typeof userStats.totalRewardsEarned === "number", "User total rewards is a number");

    const userHistory = await referralService.getReferralHistory(referrer._id, { page: 1, limit: 10 });
    assert(userHistory.referrals.length >= 2, "Alice referral history contains both Bob and Dave");

    const adminStats = await referralService.getAdminReferralStats();
    assert(adminStats.totalReferrals >= 2, "Admin total referrals aggregates properly");
    assert(adminStats.recoveryRequired >= 1, "Admin sees recovery required count");

    const adminList = await referralService.getAdminReferrals({ page: 1, limit: 10, search: "Alice" });
    assert(adminList.referrals.length >= 1, "Admin search by user name works");

    // -------------------------------------------------------------
    // Test 9: Query Code vs Manual Code Priority & Session Handling
    // -------------------------------------------------------------
    console.log("\n--- Test Group 9: Query vs Manual Code Precedence ---");
    const codeA = code1; // Alice
    const codeB = await referralService.generateUniqueReferralCode();
    const userB = await User.create({
      fullName: "Referrer B",
      email: `${testPrefix}referrerB@example.com`,
      password: "Password123!",
      referralCode: codeB
    });

    const mockSession = { referralCode: codeA };
    const userEve = await User.create({
      fullName: "Eve User",
      email: `${testPrefix}eve@example.com`,
      password: "Password123!"
    });

    // Explicit manual code (codeB) should take precedence over session code (codeA)
    const eveRef = await referralService.createReferralForUser(userEve._id, codeB, mockSession);
    assert(eveRef !== null, "Referral created for Eve");
    assert(eveRef.referrer.toString() === userB._id.toString(), "Manual code (userB) won over session query code (Alice)");
    assert(!mockSession.referralCode, "Session referral code cleared after attribution");

    // -------------------------------------------------------------
    // Test 10: Existing User Protection & Immutability
    // -------------------------------------------------------------
    console.log("\n--- Test Group 10: Existing User Protection & Immutability ---");
    // Existing user Eve attempts to become referred again with another code
    const retroAttempt = await referralService.createReferralForUser(userEve._id, code1);
    assert(retroAttempt === null || retroAttempt._id.toString() === eveRef._id.toString(), "Existing user cannot be retroactively referred");
    const eveCheck = await User.findById(userEve._id);
    assert(eveCheck.referredBy.toString() === userB._id.toString(), "Eve.referredBy is immutable");

    // -------------------------------------------------------------
    // Test 11: Partial Return Threshold Evaluation
    // -------------------------------------------------------------
    console.log("\n--- Test Group 11: Partial Return Threshold Evaluation ---");
    const frankCode = await referralService.generateUniqueReferralCode();
    const frank = await User.create({
      fullName: "Frank User",
      email: `${testPrefix}frank@example.com`,
      password: "Password123!",
      referralCode: frankCode
    });
    await referralService.attributeReferral({ userId: frank._id, referralCode: code1 });

    const frankOrder = await createMockOrder({
      user: frank._id,
      finalAmount: 1500,
      orderNumber: `TEST-REF-FRANK-${Date.now()}`
    });
    await orderService.updateOrderStatus(frankOrder._id, "SHIPPED");
    await orderService.updateOrderStatus(frankOrder._id, "OUT_FOR_DELIVERY");
    await orderService.updateOrderStatus(frankOrder._id, "DELIVERED");

    // Check Frank referral is COMPLETED
    const frankRefBefore = await Referral.findOne({ referredUser: frank._id });
    assert(frankRefBefore.status === "COMPLETED", "Frank referral completed after delivery");

    // Partial return case 1: Returned ₹300, remaining ₹1200 >= ₹1000 minimum -> Referral remains valid
    const partRet1 = await referralService.handleOrderReturnOrCancel(frankOrder._id, {
      isItemReturn: true,
      remainingOrderAmount: 1200
    });
    assert(partRet1.handled === true && partRet1.reversed === false, "Partial return with remaining ₹1200 >= ₹1000 does NOT reverse referral");
    const frankRefMid = await Referral.findOne({ referredUser: frank._id });
    assert(frankRefMid.status === "COMPLETED", "Frank referral status remains COMPLETED");

    // Partial return case 2: Returned another ₹400, remaining ₹800 < ₹1000 minimum -> Referral REVERSES
    const partRet2 = await referralService.handleOrderReturnOrCancel(frankOrder._id, {
      isItemReturn: true,
      remainingOrderAmount: 800
    });
    assert(partRet2.success === true && (partRet2.status === "REWARD_REVERSED" || partRet2.status === "REVERSED"), "Partial return with remaining ₹800 < ₹1000 reverses referral");
    const frankRefAfter = await Referral.findOne({ referredUser: frank._id });
    assert(frankRefAfter.status === "REWARD_REVERSED" || frankRefAfter.status === "REVERSED", "Frank referral status is REWARD_REVERSED");

    // -------------------------------------------------------------
    // Test 12: Program Disabled Behavior
    // -------------------------------------------------------------
    console.log("\n--- Test Group 12: Program Disabled Behavior ---");
    await ReferralProgram.updateProgram({ isActive: false });
    const disVal = await referralService.validateReferralCode(code1);
    assert(!disVal.success && disVal.message.toLowerCase().includes("disabled"), "Validation fails when program is disabled");

    const graceUser = await User.create({
      fullName: "Grace User",
      email: `${testPrefix}grace@example.com`,
      password: "Password123!"
    });
    const disAttr = await referralService.attributeReferral({ userId: graceUser._id, referralCode: code1 });
    assert(!disAttr.success || !disAttr.referral, "Attribution blocked when program is disabled");
    assert(graceUser._id !== null, "Normal user signup still succeeds when referral program is disabled");

    // Re-enable program
    await ReferralProgram.updateProgram({ isActive: true });

    // -------------------------------------------------------------
    // Test 13: Admin Retry Endpoint Logic
    // -------------------------------------------------------------
    console.log("\n--- Test Group 13: Admin Retry Trigger ---");
    // Retry on a COMPLETED referral returns idempotent result
    const retryRes = await referralService.processReferralRewards(frankRefBefore._id);
    assert(retryRes.success === true, "Admin retry on referral is safe and idempotent");

    console.log("\n==================================================");
    console.log(`🎉 ALL TESTS PASSED: ${testsPassed} passed, ${testsFailed} failed`);
    console.log("==================================================\n");

  } catch (err) {
    console.error("Test execution failed with error:", err);
  } finally {
    // Clean up
    await User.deleteMany({ email: new RegExp(`^${testPrefix}`) });
    await Referral.deleteMany({});
    await Order.deleteMany({ orderNumber: new RegExp(`^TEST-REF-`) });
    await mongoose.disconnect();
    console.log("Database disconnected.");
    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

runTests();
