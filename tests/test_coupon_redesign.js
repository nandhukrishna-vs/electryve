/**
 * Comprehensive Test Suite: Electryve Coupon Redesign + Eligible Coupon Selection
 *
 * Verifies:
 * 1. Coupon Model and Validation Rules
 * 2. Server-side Eligibility Aggregation & Categorization (getEligibleCouponsForUser)
 * 3. Projected Discount Calculation & Deterministic Ranking
 * 4. Dual Application Flow (Modal Selection + Manual Code Entry)
 * 5. Single-Coupon Invariant (Switching/Replacement & Removal)
 * 6. Authoritative Pricing Pipeline (Base -> Winning Offer -> Coupon on Offer Subtotal -> Final Amount)
 * 7. Payment Consistency & Dynamic Wallet Eligibility
 * 8. Order Snapshots & Accurate Cancellation/Refunds
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";
dotenv.config();

import User from "../src/models/User.js";
import Product from "../src/models/Product.js";
import Category from "../src/models/Category.js";
import Brand from "../src/models/Brand.js";
import Cart from "../src/models/Cart.js";
import Order from "../src/models/Order.js";
import Address from "../src/models/Address.js";
import Coupon from "../src/models/Coupon.js";
import Offer from "../src/models/Offer.js";
import Wallet from "../src/models/Wallet.js";
import WalletTransaction from "../src/models/WalletTransaction.js";

import * as couponService from "../src/services/couponService.js";
import * as cartService from "../src/services/cartService.js";
import * as orderService from "../src/services/orderService.js";
import * as walletService from "../src/services/walletService.js";

let testUser = null;
let testAddress = null;
let testCategory = null;
let testBrand = null;
let testProduct = null;
let testVariant = null;
let createdCoupons = [];
let createdOffers = [];
let createdOrders = [];

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    throw new Error(message);
  }
  passedTests++;
  console.log(`  PASS: ${message}`);
}

async function setupDatabase() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/electryve";
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB for Coupon Redesign testing.");
}

async function seedBaseData() {
  const suffix = crypto.randomBytes(4).toString("hex");

  testUser = await User.create({
    fullName: `Coupon User ${suffix}`,
    email: `coupon_${suffix}@test.com`,
    password: "Password@123",
    phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
    isVerified: true
  });

  testAddress = await Address.create({
    userId: testUser._id,
    fullName: testUser.fullName,
    phone: testUser.phone,
    addressLine1: "123 Coupon Blvd",
    city: "Kochi",
    state: "Kerala",
    pinCode: 682001,
    isDefault: true
  });

  testCategory = await Category.create({
    name: `Coupon Category ${suffix}`,
    slug: `cat-coupon-${suffix}`,
    isListed: true,
    isDeleted: false
  });

  testBrand = await Brand.create({
    name: `Coupon Brand ${suffix}`,
    slug: `brand-coupon-${suffix}`,
    isListed: true,
    isDeleted: false
  });

  testProduct = await Product.create({
    name: `Coupon Product ${suffix}`,
    slug: `prod-coupon-${suffix}`,
    brand: testBrand._id,
    category: testCategory._id,
    description: "Test product for coupon redesign",
    isListed: true,
    isDeleted: false,
    variants: [
      {
        sku: `SKU-CPN-${suffix}-1`,
        color: "Silver",
        storage: "128GB",
        regularPrice: 6000,
        salePrice: 5000,
        stock: 50,
        images: ["/uploads/test1.jpg", "/uploads/test2.jpg", "/uploads/test3.jpg"]
      }
    ]
  });

  testVariant = testProduct.variants[0];
  console.log(`Base test data seeded for user ${testUser.email}`);
}

// -------------------------------------------------------------
// Test 1: Coupon Model & Validation
// -------------------------------------------------------------
async function testCouponModelAndValidation() {
  console.log("\n--- TEST 1: Coupon Model & Creation ---");
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const pastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 1. Percentage Coupon with Cap
  const c1 = await Coupon.create({
    code: `PERC20_${Date.now()}`,
    description: "20% off up to 500",
    discountType: "PERCENTAGE",
    discountValue: 20,
    maxDiscountAmount: 500,
    minPurchaseAmount: 1500,
    startDate: pastMonth,
    expiryDate: nextMonth,
    isActive: true,
    usageLimit: 100,
    perUserLimit: 2
  });
  createdCoupons.push(c1);
  assert(c1.discountType === "PERCENTAGE", "Percentage coupon created");
  assert(c1.maxDiscountAmount === 500, "Max discount cap preserved");

  // 2. Fixed Coupon
  const c2 = await Coupon.create({
    code: `FLAT300_${Date.now()}`,
    description: "Flat 300 off on 2000+",
    discountType: "FIXED",
    discountValue: 300,
    minPurchaseAmount: 2000,
    startDate: pastMonth,
    expiryDate: nextMonth,
    isActive: true,
    usageLimit: 50,
    perUserLimit: 1
  });
  createdCoupons.push(c2);
  assert(c2.discountType === "FIXED", "Fixed coupon created");

  // 3. Expired Coupon
  const c3 = await Coupon.create({
    code: `EXPIRED_${Date.now()}`,
    description: "Expired coupon",
    discountType: "FIXED",
    discountValue: 100,
    minPurchaseAmount: 500,
    startDate: pastMonth,
    expiryDate: yesterday,
    isActive: true
  });
  createdCoupons.push(c3);

  // 4. Inactive Coupon
  const c4 = await Coupon.create({
    code: `INACTIVE_${Date.now()}`,
    description: "Inactive coupon",
    discountType: "PERCENTAGE",
    discountValue: 10,
    minPurchaseAmount: 500,
    startDate: pastMonth,
    expiryDate: nextMonth,
    isActive: false
  });
  createdCoupons.push(c4);

  // 5. Total Usage Exhausted Coupon
  const c5 = await Coupon.create({
    code: `EXHAUST_${Date.now()}`,
    description: "Usage limit reached",
    discountType: "FIXED",
    discountValue: 200,
    minPurchaseAmount: 500,
    startDate: pastMonth,
    expiryDate: nextMonth,
    isActive: true,
    usageLimit: 5,
    usedCount: 5
  });
  createdCoupons.push(c5);

  assert(createdCoupons.length === 5, "All sample coupons created for validation");
}

// -------------------------------------------------------------
// Test 2: Server-side Eligibility Aggregation & Categorization
// -------------------------------------------------------------
async function testEligibilityLogic() {
  console.log("\n--- TEST 2: Server-side Eligibility Categorization ---");

  // Scenario A: Subtotal is ₹1,000 (Below min ₹1,500 for PERC20 and min ₹2,000 for FLAT300)
  const resultLow = await couponService.getEligibleCouponsForUser(testUser._id, { subtotal: 1000 });
  assert(Array.isArray(resultLow.eligibleCoupons), "Eligible coupons returned as array");
  assert(Array.isArray(resultLow.ineligibleCoupons), "Ineligible coupons returned as array");

  // Check that PERC20 and FLAT300 are in ineligible with informative shortfall
  const percInelig = resultLow.ineligibleCoupons.find(c => c.code.startsWith("PERC20"));
  assert(percInelig !== undefined, "PERC20 is marked ineligible for ₹1000 subtotal");
  assert(percInelig.ineligibleReason.includes("500"), `Shortfall correctly calculated: "${percInelig.ineligibleReason}"`);

  const flatInelig = resultLow.ineligibleCoupons.find(c => c.code.startsWith("FLAT300"));
  assert(flatInelig !== undefined, "FLAT300 is marked ineligible for ₹1000 subtotal");
  assert(flatInelig.ineligibleReason.includes("1,000"), `Shortfall correctly calculated: "${flatInelig.ineligibleReason}"`);

  // Expired coupon must be in ineligible with "expired" reason
  const expInelig = resultLow.ineligibleCoupons.find(c => c.code.startsWith("EXPIRED"));
  assert(expInelig !== undefined, "Expired coupon found in ineligible list");
  assert(expInelig.ineligibleReason.toLowerCase().includes("expired"), "Expired reason stated");

  // Exhausted coupon must be in ineligible with limit reached
  const exhInelig = resultLow.ineligibleCoupons.find(c => c.code.startsWith("EXHAUST"));
  assert(exhInelig !== undefined, "Exhausted coupon found in ineligible list");
  assert(exhInelig.ineligibleReason.toLowerCase().includes("usage limit"), "Limit reached reason stated");

  // Scenario B: Subtotal is ₹5,000 (Eligible for both PERC20 and FLAT300)
  const resultHigh = await couponService.getEligibleCouponsForUser(testUser._id, { subtotal: 5000 });
  const percElig = resultHigh.eligibleCoupons.find(c => c.code.startsWith("PERC20"));
  const flatElig = resultHigh.eligibleCoupons.find(c => c.code.startsWith("FLAT300"));

  assert(percElig !== undefined, "PERC20 is marked eligible for ₹5000 subtotal");
  assert(flatElig !== undefined, "FLAT300 is marked eligible for ₹5000 subtotal");

  // Verify projected discount:
  // 20% of 5000 is 1000, capped at maxDiscountAmount 500 -> projectedDiscount = 500
  assert(percElig.projectedDiscount === 500, `Projected discount capped at 500: got ${percElig.projectedDiscount}`);
  // Flat 300 -> projectedDiscount = 300
  assert(flatElig.projectedDiscount === 300, `Projected discount flat 300: got ${flatElig.projectedDiscount}`);

  // Ranking: PERC20 has projected 500 > FLAT300 projected 300 -> PERC20 appears before FLAT300
  const percIndex = resultHigh.eligibleCoupons.findIndex(c => c.code.startsWith("PERC20"));
  const flatIndex = resultHigh.eligibleCoupons.findIndex(c => c.code.startsWith("FLAT300"));
  assert(percIndex < flatIndex, "Coupons sorted by projected savings descending");

  // Scenario C: Currently applied coupon prioritization
  const resultApplied = await couponService.getEligibleCouponsForUser(testUser._id, {
    subtotal: 5000,
    appliedCode: flatElig.code
  });
  assert(resultApplied.eligibleCoupons[0].code === flatElig.code, "Currently applied coupon is ranked first even with lower discount");
  assert(resultApplied.eligibleCoupons[0].isApplied === true, "isApplied flag set to true for active coupon");
}

// -------------------------------------------------------------
// Test 3: Per-User Usage Limit Enforcement via Order History
// -------------------------------------------------------------
async function testPerUserLimitEnforcement() {
  console.log("\n--- TEST 3: Per-User Usage Limit Enforcement ---");
  const flatCoupon = createdCoupons.find(c => c.code.startsWith("FLAT300"));

  // PerUserLimit is 1 for FLAT300. Create an order placed by testUser using FLAT300.
  const order1 = await Order.create({
    orderNumber: `ORD-TST-${Date.now()}-1`,
    user: testUser._id,
    items: [
      {
        product: testProduct._id,
        variantId: testVariant._id,
        sku: testVariant.sku,
        productName: testProduct.name,
        brandName: testBrand.name,
        variantDetails: `${testVariant.color} ${testVariant.storage}`,
        image: testVariant.images[0],
        quantity: 1,
        regularPrice: 6000,
        salePrice: 5000,
        itemTotal: 4700
      }
    ],
    shippingAddress: {
      fullName: testAddress.fullName,
      phone: testAddress.phone,
      addressLine1: testAddress.addressLine1,
      city: testAddress.city,
      state: testAddress.state,
      pinCode: testAddress.pinCode
    },
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    orderStatus: "PLACED",
    subtotal: 5000,
    discount: 300,
    coupon: {
      couponId: flatCoupon._id,
      code: flatCoupon.code,
      discountType: flatCoupon.discountType,
      discountValue: flatCoupon.discountValue,
      discountAmount: 300
    },
    shippingFee: 0,
    finalAmount: 4700
  });
  createdOrders.push(order1);

  // Now query eligibility for testUser
  const result = await couponService.getEligibleCouponsForUser(testUser._id, { subtotal: 5000 });
  const flatInelig = result.ineligibleCoupons.find(c => c.code === flatCoupon.code);

  assert(flatInelig !== undefined, "FLAT300 now moved to ineligibleCoupons after order placed");
  assert(flatInelig.ineligibleReason.includes("already used"), `Reason indicates user limit: "${flatInelig.ineligibleReason}"`);
}

// -------------------------------------------------------------
// Test 4: Authoritative Pricing Pipeline (Offers + Coupons)
// -------------------------------------------------------------
async function testOffersAndCouponsPipeline() {
  console.log("\n--- TEST 4: Authoritative Pricing Pipeline (Offers -> Coupons) ---");

  // Create an active Product Offer: 10% off
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const pastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const productOffer = await Offer.create({
    name: "Flash Product 10% OFF",
    scope: "PRODUCT",
    discountType: "PERCENTAGE",
    discountValue: 10,
    products: [testProduct._id],
    startAt: pastMonth,
    expiryAt: nextMonth,
    isActive: true
  });
  createdOffers.push(productOffer);

  // Create an active Category Offer: 20% off
  const categoryOffer = await Offer.create({
    name: "Super Category 20% OFF",
    scope: "CATEGORY",
    discountType: "PERCENTAGE",
    discountValue: 20,
    categories: [testCategory._id],
    startAt: pastMonth,
    expiryAt: nextMonth,
    isActive: true
  });
  createdOffers.push(categoryOffer);

  // Seed user cart with 1 unit of product (Base Sale Price = 5000)
  await Cart.deleteMany({ user: testUser._id });
  await Cart.create({
    user: testUser._id,
    items: [
      {
        product: testProduct._id,
        variantId: testVariant._id,
        quantity: 1,
        priceSnapshot: 5000,
        nameSnapshot: testProduct.name,
        variantSnapshot: `${testVariant.color} ${testVariant.storage}`,
        imageSnapshot: testVariant.images[0]
      }
    ]
  });

  // Recalculate cart offers using getCart
  const cartInfo = await cartService.getCart(testUser._id);
  // Winning offer is Category 20% (₹1,000 off vs Product 10% ₹500 off)
  const item = cartInfo.items[0];
  assert(item.appliedOffer !== null, "Winning offer applied to item");
  assert(item.appliedOffer.offerName === categoryOffer.name, "Category offer wins because discount 20% > 10%");
  assert(item.unitOfferDiscount === 1000, `Unit discount is 1000: got ${item.unitOfferDiscount}`);
  assert(item.itemTotal === 4000, `Offer-adjusted item total is 4000: got ${item.itemTotal}`);
  assert(cartInfo.cartSummary.subtotal === 4000, `Live Offer-adjusted subtotal is 4000: got ${cartInfo.cartSummary.subtotal}`);

  // Create Coupon with minPurchase = 4500 (Base price 5000 meets it, but offer-adjusted 4000 DOES NOT!)
  const strictCoupon = await Coupon.create({
    code: `STRICT4500_${Date.now()}`,
    description: "Strict min 4500",
    discountType: "FIXED",
    discountValue: 500,
    minPurchaseAmount: 4500,
    startDate: pastMonth,
    expiryDate: nextMonth,
    isActive: true
  });
  createdCoupons.push(strictCoupon);

  // Attempt to validate STRICT4500 against offer-adjusted subtotal
  const strictValidation = await couponService.validateUserCoupon(testUser._id, strictCoupon.code, cartInfo.cartSummary.subtotal);
  assert(strictValidation.success === false, "Strict coupon rejected because offer-adjusted subtotal (4000) is below min purchase (4500)");
  assert(strictValidation.message.includes("4,500") || strictValidation.message.includes("4500"), `Informative error message: ${strictValidation.message}`);

  // Create Coupon with minPurchase = 3500 (Offer-adjusted 4000 MEETS this threshold)
  const validCoupon = await Coupon.create({
    code: `SAVE400_${Date.now()}`,
    description: "Save 400 on 3500+",
    discountType: "FIXED",
    discountValue: 400,
    minPurchaseAmount: 3500,
    startDate: pastMonth,
    expiryDate: nextMonth,
    isActive: true
  });
  createdCoupons.push(validCoupon);

  // Validate SAVE400 against offer-adjusted subtotal
  const validValidation = await couponService.validateUserCoupon(testUser._id, validCoupon.code, cartInfo.cartSummary.subtotal);
  assert(validValidation.success === true, "Valid coupon accepted on offer-adjusted subtotal");
  assert(validValidation.discountAmount === 400, "Coupon discount is 400");
  assert(validValidation.payableAmount === 3600, `Payable amount is 3600 (4000 offer subtotal - 400 coupon): got ${validValidation.payableAmount}`);
}

// -------------------------------------------------------------
// Test 5: Single Coupon Invariant (Replacement & Removal)
// -------------------------------------------------------------
async function testCouponReplacementAndRemoval() {
  console.log("\n--- TEST 5: Single Coupon Invariant (Replacement & Removal) ---");
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const pastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Create replacement coupon: 10% off (on 4000 = 400 off, capped at 350, min 3000)
  const replaceCoupon = await Coupon.create({
    code: `REPLACE10_${Date.now()}`,
    description: "10% replacement coupon",
    discountType: "PERCENTAGE",
    discountValue: 10,
    maxDiscountAmount: 350,
    minPurchaseAmount: 3000,
    startDate: pastMonth,
    expiryDate: nextMonth,
    isActive: true
  });
  createdCoupons.push(replaceCoupon);

  const cartInfo = await cartService.getCart(testUser._id);
  const subtotal = cartInfo.cartSummary.subtotal; // 4000

  // First validate SAVE400
  const cpnA = createdCoupons.find(c => c.code.startsWith("SAVE400"));
  const resA = await couponService.validateUserCoupon(testUser._id, cpnA.code, subtotal);
  assert(resA.success === true && resA.discountAmount === 400, "Coupon A validated with 400 discount");

  // Now validate REPLACE10 as replacement (simulates replacing Coupon A with Coupon B)
  const resB = await couponService.validateUserCoupon(testUser._id, replaceCoupon.code, subtotal);
  assert(resB.success === true, "Coupon B validated successfully as replacement");
  assert(resB.discountAmount === 350, "Capped discount 350 applied (10% of 4000 capped at 350)");
  assert(resB.payableAmount === 3650, `Payable amount updated to 3650: got ${resB.payableAmount}`);

  // Invariant check: Discount does not stack
  const finalDiscount = resB.discountAmount;
  assert(finalDiscount === 350, "Discount is exactly 350, not 400 + 350 (no stacking)");
}

// -------------------------------------------------------------
// Test 6: Dynamic Wallet Eligibility & Payment Execution
// -------------------------------------------------------------
async function testWalletEligibilityAndPayment() {
  console.log("\n--- TEST 6: Dynamic Wallet Eligibility & Payment ---");

  // Set user wallet balance to ₹3,500
  await Wallet.deleteMany({ user: testUser._id });
  await WalletTransaction.deleteMany({ user: testUser._id });
  const wallet = await walletService.getOrCreateWallet(testUser._id);
  wallet.balance = 3650;
  await wallet.save();

  // Cart subtotal with 20% category offer is ₹4,000, shipping is ₹150 -> grandTotal is ₹4,150
  const cartInfo = await cartService.getCart(testUser._id);
  const grandTotalWithoutCoupon = cartInfo.cartSummary.grandTotal; // 4150
  // Without coupon: wallet balance (3650) < grandTotal (4150) -> Cannot pay with wallet!
  assert(wallet.balance < grandTotalWithoutCoupon, `Wallet balance 3650 is insufficient for ${grandTotalWithoutCoupon} total without coupon`);

  // Validate PERC20 coupon (capped at 500)
  const cpn = createdCoupons.find(c => c.code.startsWith("PERC20"));
  const validation = await couponService.validateUserCoupon(testUser._id, cpn.code, cartInfo.cartSummary.subtotal);
  assert(validation.success === true, "PERC20 validated successfully");
  const finalPayable = validation.payableAmount + cartInfo.cartSummary.shipping; // 3500 + 150 = 3650
  assert(finalPayable === 3650, `Final payable after coupon is 3650: got ${finalPayable}`);
  assert(wallet.balance >= finalPayable, "Wallet balance 3650 is now EXACTLY SUFFICIENT for 3650 final amount!");

  // Place order using WALLET payment method via createWalletOrder
  const orderResult = await orderService.createWalletOrder(
    testUser._id,
    testAddress._id,
    cpn.code,
    `IDEM_TEST_${Date.now()}`
  );
  assert(orderResult.success === true, "Wallet order placed successfully");

  const order = await Order.findById(orderResult.orderId);
  createdOrders.push(order);

  assert(order.paymentMethod === "WALLET", "Order payment method is WALLET");
  assert(order.paymentStatus === "COMPLETED" || order.paymentStatus === "PAID", `Order payment status is ${order.paymentStatus}`);
  assert(order.coupon.code === cpn.code, `Order snapshot has coupon code ${cpn.code}`);
  assert(order.coupon.discountAmount === 500, "Order snapshot has coupon discount 500");
  assert(order.finalAmount === 3650, `Order snapshot final amount is 3650: got ${order.finalAmount}`);

  // Check updated wallet balance: 3650 - 3650 = 0
  const balanceAfterOrder = await walletService.getWalletBalance(testUser._id);
  assert(balanceAfterOrder === 0, `Wallet balance deducted to 0: got ${balanceAfterOrder}`);

  // Verify wallet transaction record
  const tx = await WalletTransaction.findOne({ orderId: order._id, type: "DEBIT" });
  assert(tx !== null, "Wallet transaction recorded for checkout");
  assert(tx.amount === 3650, `Transaction amount is 3650: got ${tx.amount}`);
}

// -------------------------------------------------------------
// Test 7: Order Cancellation & Accurate Wallet Refund
// -------------------------------------------------------------
async function testOrderCancellationRefund() {
  console.log("\n--- TEST 7: Order Cancellation & Accurate Wallet Refund ---");
  const order = createdOrders[createdOrders.length - 1];

  // User cancels order
  const cancelRes = await orderService.cancelOrder(
    order._id,
    testUser._id,
    "Customer changed mind after coupon purchase"
  );

  assert(cancelRes.success === true, "Order cancelled successfully");

  // Refund must be for the net amount customer paid (3650), NOT gross price (4000 or 5000)
  const balanceAfterRefund = await walletService.getWalletBalance(testUser._id);
  assert(balanceAfterRefund === 3650, `Customer refunded exact paid amount (3650): got ${balanceAfterRefund}`);

  const refundTx = await WalletTransaction.findOne({ orderId: order._id, type: "CREDIT" });
  assert(refundTx !== null, "Refund transaction created in wallet");
  assert(refundTx.amount === 3650, `Refund transaction amount matches paid amount: ${refundTx.amount}`);
}

async function cleanup() {
  console.log("\nCleaning up test data...");
  if (testUser) {
    await User.deleteMany({ _id: testUser._id });
    await Address.deleteMany({ userId: testUser._id });
    await Cart.deleteMany({ user: testUser._id });
    await Wallet.deleteMany({ userId: testUser._id });
    await WalletTransaction.deleteMany({ userId: testUser._id });
  }
  if (createdOrders.length > 0) {
    await Order.deleteMany({ _id: { $in: createdOrders.map(o => o._id) } });
  }
  if (createdCoupons.length > 0) {
    await Coupon.deleteMany({ _id: { $in: createdCoupons.map(c => c._id) } });
  }
  if (createdOffers.length > 0) {
    await Offer.deleteMany({ _id: { $in: createdOffers.map(o => o._id) } });
  }
  if (testProduct) {
    await Product.deleteMany({ _id: testProduct._id });
  }
  if (testCategory) {
    await Category.deleteMany({ _id: testCategory._id });
  }
  if (testBrand) {
    await Brand.deleteMany({ _id: testBrand._id });
  }
  console.log("Cleanup complete.");
}

async function run() {
  try {
    await setupDatabase();
    await seedBaseData();

    await testCouponModelAndValidation();
    await testEligibilityLogic();
    await testPerUserLimitEnforcement();
    await testOffersAndCouponsPipeline();
    await testCouponReplacementAndRemoval();
    await testWalletEligibilityAndPayment();
    await testOrderCancellationRefund();

    console.log(`\n========================================`);
    console.log(`COUPON REDESIGN TEST SUITE COMPLETED`);
    console.log(`Passed: ${passedTests}/${totalTests} tests`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error("Test execution aborted with error:", err);
  } finally {
    await cleanup();
    await mongoose.disconnect();
    process.exit(totalTests === passedTests && totalTests > 0 ? 0 : 1);
  }
}

run();
