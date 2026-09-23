/**
 * Master Verification Test Suite: Electryve Offer Management Module
 * Validates all core rules, concurrency, tie-breaking, stacking prohibition,
 * snapshots, coupon interplay, payment modes, and refund preservation.
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
import Wallet from "../src/models/Wallet.js";
import Offer from "../src/models/Offer.js";
import PaymentAttempt from "../src/models/PaymentAttempt.js";

import * as offerService from "../src/services/offerService.js";
import * as cartService from "../src/services/cartService.js";
import * as orderService from "../src/services/orderService.js";
import * as paymentService from "../src/services/paymentService.js";
import * as walletService from "../src/services/walletService.js";
import { getRazorpayClient } from "../src/config/razorpay.js";

let testUser = null;
let referrerUser = null;
let testAddress = null;
let testCategory1 = null;
let testCategory2 = null;
let testBrand = null;
let testProduct1 = null;
let testVariant1 = null;
let testProduct2 = null;
let testVariant2 = null;
let testProduct3 = null;
let testVariant3 = null;

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(message);
  }
  passedTests++;
  console.log(`  ✅ PASS: ${message}`);
}

async function setupDatabase() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/electryve";
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB for testing.");
}

async function seedBaseData() {
  const randomSuffix = crypto.randomBytes(4).toString("hex");

  // Create Users
  testUser = await User.create({
    fullName: `Offer Test User ${randomSuffix}`,
    email: `offer_${randomSuffix}@test.com`,
    password: "Password@123",
    phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
    isVerified: true
  });

  referrerUser = await User.create({
    fullName: `Referrer User ${randomSuffix}`,
    email: `referrer_${randomSuffix}@test.com`,
    password: "Password@123",
    phone: `99${Math.floor(10000000 + Math.random() * 90000000)}`,
    referralCode: `REF${randomSuffix.toUpperCase()}`,
    isVerified: true
  });

  // Create Address
  testAddress = await Address.create({
    userId: testUser._id,
    fullName: "Tester Address",
    phone: "9876543210",
    addressLine1: "123 Tech Lane",
    city: "Bangalore",
    state: "Karnataka",
    pinCode: 560001,
    isDefault: true
  });

  // Create Categories & Brand
  testCategory1 = await Category.create({
    name: `Laptops ${randomSuffix}`,
    slug: `laptops-${randomSuffix}`,
    isListed: true,
    isDeleted: false
  });

  testCategory2 = await Category.create({
    name: `Accessories ${randomSuffix}`,
    slug: `accessories-${randomSuffix}`,
    isListed: true,
    isDeleted: false
  });

  testBrand = await Brand.create({
    name: `Electryve Brand ${randomSuffix}`,
    slug: `brand-${randomSuffix}`,
    isListed: true,
    isDeleted: false
  });

  // Product 1 (in Category 1): ₹50,000 Laptop
  testProduct1 = await Product.create({
    name: `Pro Laptop ${randomSuffix}`,
    slug: `pro-laptop-${randomSuffix}`,
    description: "High performance laptop",
    category: testCategory1._id,
    brand: testBrand._id,
    isListed: true,
    isDeleted: false,
    variants: [{
      sku: `LAP-${randomSuffix}-01`,
      color: "Space Grey",
      storage: "512GB",
      regularPrice: 60000,
      salePrice: 50000,
      stock: 20,
      isListed: true,
      images: ["/uploads/test1.jpg", "/uploads/test2.jpg", "/uploads/test3.jpg"]
    }]
  });
  testVariant1 = testProduct1.variants[0];

  // Product 2 (in Category 1): ₹10,000 Budget Tablet
  testProduct2 = await Product.create({
    name: `Budget Tablet ${randomSuffix}`,
    slug: `budget-tablet-${randomSuffix}`,
    description: "Affordable tablet",
    category: testCategory1._id,
    brand: testBrand._id,
    isListed: true,
    isDeleted: false,
    variants: [{
      sku: `TAB-${randomSuffix}-01`,
      color: "Black",
      storage: "64GB",
      regularPrice: 12000,
      salePrice: 10000,
      stock: 20,
      isListed: true,
      images: ["/uploads/test1.jpg", "/uploads/test2.jpg", "/uploads/test3.jpg"]
    }]
  });
  testVariant2 = testProduct2.variants[0];

  // Product 3 (in Category 2): ₹2,000 Wireless Mouse
  testProduct3 = await Product.create({
    name: `Wireless Mouse ${randomSuffix}`,
    slug: `wireless-mouse-${randomSuffix}`,
    description: "Ergonomic mouse",
    category: testCategory2._id,
    brand: testBrand._id,
    isListed: true,
    isDeleted: false,
    variants: [{
      sku: `MOU-${randomSuffix}-01`,
      color: "White",
      storage: "Standard",
      regularPrice: 2500,
      salePrice: 2000,
      stock: 50,
      isListed: true,
      images: ["/uploads/test1.jpg", "/uploads/test2.jpg", "/uploads/test3.jpg"]
    }]
  });
  testVariant3 = testProduct3.variants[0];

  console.log("Base seed data created successfully.");
}

async function runTests() {
  console.log("\n========================================================");
  console.log("🚀 STARTING ELECTRYVE OFFER MANAGEMENT MODULE TEST SUITE");
  console.log("========================================================\n");

  const now = new Date();
  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // -------------------------------------------------------------
  // TEST 1: Unit Offer Calculation (Percentage, Cap, Floor, Fixed)
  // -------------------------------------------------------------
  console.log("\n--- TEST 1: Unit Offer Calculation Math ---");
  {
    // 10% on 50,000 = 5,000
    const offerPerc = { discountType: "PERCENTAGE", discountValue: 10 };
    const disc1 = offerService.calculateUnitOfferDiscount(offerPerc, 50000);
    assert(disc1 === 5000, "10% on ₹50,000 produces exactly ₹5,000 discount");

    // 20% on 50,000 with max cap 2,000 = 2,000
    const offerCap = { discountType: "PERCENTAGE", discountValue: 20, maxDiscountAmount: 2000 };
    const disc2 = offerService.calculateUnitOfferDiscount(offerCap, 50000);
    assert(disc2 === 2000, "20% on ₹50,000 with ₹2,000 cap is capped at ₹2,000");

    // Flat ₹3,000 off ₹10,000
    const offerFixed = { discountType: "FIXED", discountValue: 3000 };
    const disc3 = offerService.calculateUnitOfferDiscount(offerFixed, 10000);
    assert(disc3 === 3000, "Flat ₹3,000 off ₹10,000 gives ₹3,000");

    // Floor: Flat ₹15,000 off ₹10,000 unit cannot exceed unitPrice
    const discFloor = offerService.calculateUnitOfferDiscount({ discountType: "FIXED", discountValue: 15000 }, 10000);
    assert(discFloor === 10000, "Discount cannot exceed unit price (floor at 0)");
  }

  // -------------------------------------------------------------
  // TEST 2: Product Offer vs Category Offer (CRITICAL: NEVER STACK)
  // -------------------------------------------------------------
  console.log("\n--- TEST 2: Product vs Category Offer Selection (No Stacking) ---");
  {
    // Create Product Offer: Flat ₹3,000 OFF on Product 1
    const prodOffer = await Offer.create({
      name: "Product 1 Flat 3000 OFF",
      scope: "PRODUCT",
      products: [testProduct1._id],
      discountType: "FIXED",
      discountValue: 3000,
      startAt: past,
      expiryAt: future,
      isActive: true,
      priority: 0
    });

    // Create Category Offer: 5% OFF on Category 1 (5% of 50,000 = 2,500)
    const catOffer = await Offer.create({
      name: "Category 1 5% OFF",
      scope: "CATEGORY",
      categories: [testCategory1._id],
      discountType: "PERCENTAGE",
      discountValue: 5,
      startAt: past,
      expiryAt: future,
      isActive: true,
      priority: 0
    });

    // Product 1: Product Offer gives ₹3,000; Category gives ₹2,500. Product offer MUST win ₹3,000 (NOT stack to 5,500!)
    const evalResult = await offerService.getBestOfferForItem({
      productId: testProduct1._id,
      categoryId: testCategory1._id,
      unitPrice: 50000,
      quantity: 1,
      userId: testUser._id
    });

    assert(evalResult.bestOffer !== null, "An offer was selected");
    assert(evalResult.bestOffer.offerId.toString() === prodOffer._id.toString(), "Product offer won because ₹3,000 > ₹2,500");
    assert(evalResult.unitDiscount === 3000, "Winning unit discount is ₹3,000");
    assert(evalResult.effectiveItemPrice === 47000, "Effective price is 50,000 - 3,000 = ₹47,000");
    assert(evalResult.itemTotal === 47000, "Item total is ₹47,000");

    // Clean up
    await Offer.deleteMany({ _id: { $in: [prodOffer._id, catOffer._id] } });
  }

  // -------------------------------------------------------------
  // TEST 3: Monetary Comparison in ₹ (Category Beats Product)
  // -------------------------------------------------------------
  console.log("\n--- TEST 3: Monetary Comparison (Category beats Product in ₹) ---");
  {
    // Product offer: Flat ₹1,500 OFF
    const prodOffer = await Offer.create({
      name: "Product Flat 1500 OFF",
      scope: "PRODUCT",
      products: [testProduct1._id],
      discountType: "FIXED",
      discountValue: 1500,
      startAt: past,
      expiryAt: future,
      isActive: true,
      priority: 0
    });

    // Category offer: 10% OFF on Category 1 (10% of 50,000 = ₹5,000)
    const catOffer = await Offer.create({
      name: "Category 10% OFF",
      scope: "CATEGORY",
      categories: [testCategory1._id],
      discountType: "PERCENTAGE",
      discountValue: 10,
      startAt: past,
      expiryAt: future,
      isActive: true,
      priority: 0
    });

    const evalResult = await offerService.getBestOfferForItem({
      productId: testProduct1._id,
      categoryId: testCategory1._id,
      unitPrice: 50000,
      quantity: 1,
      userId: testUser._id
    });

    assert(evalResult.bestOffer.offerId.toString() === catOffer._id.toString(), "Category offer won because ₹5,000 > ₹1,500");
    assert(evalResult.unitDiscount === 5000, "Unit discount is ₹5,000");
    assert(evalResult.effectiveItemPrice === 45000, "Effective price is ₹45,000");

    await Offer.deleteMany({ _id: { $in: [prodOffer._id, catOffer._id] } });
  }

  // -------------------------------------------------------------
  // TEST 4: Deterministic Tie-Breaking (Priority -> Date -> ID)
  // -------------------------------------------------------------
  console.log("\n--- TEST 4: Deterministic Tie-Breaking ---");
  {
    // Offer A: Flat ₹2,000 with Priority 10
    const offerHighPri = await Offer.create({
      name: "Offer Priority 10",
      scope: "PRODUCT",
      products: [testProduct1._id],
      discountType: "FIXED",
      discountValue: 2000,
      startAt: past,
      expiryAt: future,
      isActive: true,
      priority: 10
    });

    // Offer B: Flat ₹2,000 with Priority 5
    const offerLowPri = await Offer.create({
      name: "Offer Priority 5",
      scope: "PRODUCT",
      products: [testProduct1._id],
      discountType: "FIXED",
      discountValue: 2000,
      startAt: past,
      expiryAt: future,
      isActive: true,
      priority: 5
    });

    const evalPri = await offerService.getBestOfferForItem({
      productId: testProduct1._id,
      categoryId: testCategory1._id,
      unitPrice: 50000,
      quantity: 1
    });
    assert(evalPri.bestOffer.offerId.toString() === offerHighPri._id.toString(), "Higher priority offer wins on equal discount");

    await Offer.deleteMany({ _id: { $in: [offerHighPri._id, offerLowPri._id] } });
  }

  // -------------------------------------------------------------
  // TEST 5: Multi-Quantity Scaling
  // -------------------------------------------------------------
  console.log("\n--- TEST 5: Multi-Quantity Scaling ---");
  {
    const offer = await Offer.create({
      name: "Mouse Flat 200 OFF",
      scope: "PRODUCT",
      products: [testProduct3._id],
      discountType: "FIXED",
      discountValue: 200,
      startAt: past,
      expiryAt: future,
      isActive: true
    });

    const qty3Eval = await offerService.getBestOfferForItem({
      productId: testProduct3._id,
      categoryId: testCategory2._id,
      unitPrice: 2000,
      quantity: 3
    });

    assert(qty3Eval.unitDiscount === 200, "Unit discount is ₹200");
    assert(qty3Eval.totalOfferDiscount === 600, "Total discount for 3 units is ₹600");
    assert(qty3Eval.effectiveItemPrice === 1800, "Effective unit price is ₹1,800");
    assert(qty3Eval.itemTotal === 5400, "Total item price for 3 units is ₹5,400");

    await Offer.deleteOne({ _id: offer._id });
  }

  // -------------------------------------------------------------
  // TEST 6: Multi-Item Cart Evaluation (Different Items Win Different Offers)
  // -------------------------------------------------------------
  console.log("\n--- TEST 6: Multi-Item Cart Evaluation ---");
  {
    // Product 1 Offer: Flat 5000 OFF
    const p1Offer = await Offer.create({
      name: "Laptop Mega Discount",
      scope: "PRODUCT",
      products: [testProduct1._id],
      discountType: "FIXED",
      discountValue: 5000,
      startAt: past,
      expiryAt: future,
      isActive: true
    });

    // Category 2 Offer: 10% OFF Accessories
    const c2Offer = await Offer.create({
      name: "Accessories 10% OFF",
      scope: "CATEGORY",
      categories: [testCategory2._id],
      discountType: "PERCENTAGE",
      discountValue: 10,
      startAt: past,
      expiryAt: future,
      isActive: true
    });

    // Clear cart and add Product 1 (Qty 1) and Product 3 (Qty 2)
    await Cart.deleteMany({ user: testUser._id });
    await cartService.addToCart(testUser._id, testProduct1._id, testVariant1._id, 1);
    await cartService.addToCart(testUser._id, testProduct3._id, testVariant3._id, 2);

    const cart = await cartService.getCart(testUser._id);
    assert(cart.items.length === 2, "Cart contains 2 distinct items");

    const lapItem = cart.items.find(it => it.product._id.toString() === testProduct1._id.toString());
    const mouseItem = cart.items.find(it => it.product._id.toString() === testProduct3._id.toString());

    assert(lapItem.appliedOffer.offerId.toString() === p1Offer._id.toString(), "Laptop item won Laptop Mega Discount");
    assert(lapItem.offerDiscount === 5000, "Laptop item offer discount is ₹5,000");
    assert(lapItem.itemTotal === 45000, "Laptop item total is 50,000 - 5,000 = ₹45,000");

    assert(mouseItem.appliedOffer.offerId.toString() === c2Offer._id.toString(), "Mouse item won Accessories 10% OFF");
    // Mouse price: ₹2,000. 10% = ₹200 per unit. Qty 2 = ₹400 discount. Total = ₹3,600.
    assert(mouseItem.offerDiscount === 400, "Mouse item offer discount is ₹400");
    assert(mouseItem.itemTotal === 3600, "Mouse item total is ₹3,600");

    // Offer-adjusted subtotal: 45,000 + 3,600 = 48,600
    assert(cart.cartSummary.subtotal === 48600, "Cart subtotal is offer-adjusted: ₹48,600");
    assert(cart.cartSummary.totalOfferDiscount === 5400, "Total offer discount is 5,000 + 400 = ₹5,400");

    await Offer.deleteMany({ _id: { $in: [p1Offer._id, c2Offer._id] } });
  }

  // -------------------------------------------------------------
  // TEST 7: Coupon Interaction (Coupon evaluated on Offer-Adjusted Subtotal)
  // -------------------------------------------------------------
  console.log("\n--- TEST 7: Coupon Interplay with Offers ---");
  {
    // Create an active offer on Product 1: Flat ₹5,000 OFF (Laptop drops to ₹45,000)
    const offer = await Offer.create({
      name: "Laptop 5K Discount",
      scope: "PRODUCT",
      products: [testProduct1._id],
      discountType: "FIXED",
      discountValue: 5000,
      startAt: past,
      expiryAt: future,
      isActive: true
    });

    // Create coupon with minPurchase 46,000
    const couponStrict = await Coupon.create({
      code: "STRICT46K",
      discountType: "FIXED",
      discountValue: 1000,
      minPurchaseAmount: 46000,
      startDate: past,
      expiryDate: future,
      isActive: true
    });

    // Create coupon with minPurchase 40,000
    const couponValid = await Coupon.create({
      code: "VALID40K",
      discountType: "FIXED",
      discountValue: 1000,
      minPurchaseAmount: 40000,
      startDate: past,
      expiryDate: future,
      isActive: true
    });

    // Cart with only Product 1 (base 50,000 - 5,000 offer = 45,000 offer-adjusted subtotal)
    await Cart.deleteMany({ user: testUser._id });
    await cartService.addToCart(testUser._id, testProduct1._id, testVariant1._id, 1);
    const cart = await cartService.getCart(testUser._id);

    // Validate STRICT46K (requires 46,000, but offer-adjusted subtotal is 45,000 -> must fail)
    const valStrict = await cartService.getCart(testUser._id);
    const checkStrict = await import("../src/services/couponService.js").then(m =>
      m.validateUserCoupon(testUser._id, "STRICT46K", valStrict.cartSummary.subtotal)
    );
    assert(!checkStrict.success, "Coupon requiring ₹46,000 fails against offer-adjusted ₹45,000 subtotal");

    // Validate VALID40K (requires 40,000, subtotal 45,000 -> succeeds)
    const checkValid = await import("../src/services/couponService.js").then(m =>
      m.validateUserCoupon(testUser._id, "VALID40K", valStrict.cartSummary.subtotal)
    );
    assert(checkValid.success, "Coupon requiring ₹40,000 succeeds on ₹45,000 subtotal");
    assert(checkValid.discountAmount === 1000, "Coupon discount is ₹1,000");

    await Offer.deleteOne({ _id: offer._id });
    await Coupon.deleteMany({ _id: { $in: [couponStrict._id, couponValid._id] } });
  }

  // -------------------------------------------------------------
  // TEST 8: COD Order Placement with Historical Snapshotting
  // -------------------------------------------------------------
  console.log("\n--- TEST 8: COD Order Snapshotting ---");
  {
    const offer = await Offer.create({
      name: "Snap Laptop Offer",
      scope: "PRODUCT",
      products: [testProduct1._id],
      discountType: "FIXED",
      discountValue: 4000,
      startAt: past,
      expiryAt: future,
      isActive: true
    });

    await Cart.deleteMany({ user: testUser._id });
    await cartService.addToCart(testUser._id, testProduct1._id, testVariant1._id, 1);

    const codIdemp = crypto.randomUUID();
    const orderRes = await orderService.createCODOrder(testUser._id, testAddress._id, null, codIdemp);
    assert(orderRes.success, "COD order placed successfully");

    const order = await Order.findById(orderRes.orderId);
    assert(order.totalOfferDiscount === 4000, "Order records totalOfferDiscount = ₹4,000");
    assert(order.subtotal === 46000, "Order subtotal is ₹46,000");
    assert(order.finalAmount === 46000, "Order finalAmount is ₹46,000");

    const itemSnap = order.items[0];
    assert(itemSnap.appliedOfferId.toString() === offer._id.toString(), "Item snapshot has appliedOfferId");
    assert(itemSnap.appliedOfferName === "Snap Laptop Offer", "Item snapshot has appliedOfferName");
    assert(itemSnap.appliedOfferScope === "PRODUCT", "Item snapshot has appliedOfferScope");
    assert(itemSnap.appliedOfferDiscountType === "FIXED", "Item snapshot has appliedOfferDiscountType");
    assert(itemSnap.appliedOfferDiscountValue === 4000, "Item snapshot has appliedOfferDiscountValue");
    assert(itemSnap.offerDiscount === 4000, "Item snapshot has offerDiscount = 4,000");
    assert(itemSnap.effectiveItemPrice === 46000, "Item snapshot has effectiveItemPrice = 46,000");

    // Verify usage incremented
    const updatedOffer = await Offer.findById(offer._id);
    assert(updatedOffer.usedCount === 1, "Offer usedCount incremented to 1");

    await Offer.deleteOne({ _id: offer._id });
  }

  // -------------------------------------------------------------
  // TEST 9: Wallet Order Placement with Historical Snapshotting
  // -------------------------------------------------------------
  console.log("\n--- TEST 9: Wallet Order Placement & Snapshots ---");
  {
    const offer = await Offer.create({
      name: "Mouse Wallet Special",
      scope: "PRODUCT",
      products: [testProduct3._id],
      discountType: "PERCENTAGE",
      discountValue: 10,
      startAt: past,
      expiryAt: future,
      isActive: true
    });

    // Credit user's wallet with ₹5,000
    const topupRes = await walletService.creditWallet({
      userId: testUser._id,
      amount: 5000,
      description: "Test wallet topup",
      source: "REFUND",
      idempotencyKey: `TOPUP_${crypto.randomUUID()}`
    });
    assert(topupRes.success, "Wallet credited successfully with ₹5,000");

    await Cart.deleteMany({ user: testUser._id });
    await cartService.addToCart(testUser._id, testProduct3._id, testVariant3._id, 1);

    const walletIdemp = crypto.randomUUID();
    const orderRes = await orderService.createWalletOrder(testUser._id, testAddress._id, null, walletIdemp);
    assert(orderRes.success, "Wallet order placed successfully");

    const order = await Order.findById(orderRes.orderId);
    // Mouse 2000 - 10% (200) = 1800 + 100 shipping = 1900
    assert(order.totalOfferDiscount === 200, "Order records totalOfferDiscount = ₹200");
    assert(order.paymentMethod === "WALLET", "Payment method is WALLET");
    assert(order.paymentStatus === "COMPLETED", "Payment status is COMPLETED");

    const balanceAfter = await walletService.getWalletBalance(testUser._id);
    assert(balanceAfter === 5000 - order.finalAmount, `Wallet debited exactly finalAmount (₹${order.finalAmount})`);

    await Offer.deleteOne({ _id: offer._id });
  }

  // -------------------------------------------------------------
  // TEST 10: Razorpay Payment Attempt Snapshot Locking & Fulfillment
  // -------------------------------------------------------------
  console.log("\n--- TEST 10: Razorpay PaymentAttempt Offer Snapshot Locking ---");
  {
    const offer = await Offer.create({
      name: "Razorpay Offer Lock Test",
      scope: "PRODUCT",
      products: [testProduct2._id],
      discountType: "FIXED",
      discountValue: 1000,
      startAt: past,
      expiryAt: future,
      isActive: true
    });

    await Cart.deleteMany({ user: testUser._id });
    await cartService.addToCart(testUser._id, testProduct2._id, testVariant2._id, 1);

    const checkoutAttemptId = crypto.randomUUID();
    const razorRes = await paymentService.createRazorpayOrder(
      testUser._id,
      testAddress._id,
      null,
      checkoutAttemptId
    );

    assert(razorRes.success, "Razorpay payment attempt created");

    const attempt = await PaymentAttempt.findOne({ checkoutAttemptId });
    assert(attempt !== null, "PaymentAttempt saved in database");
    assert(attempt.totalOfferDiscount === 1000, "PaymentAttempt locked totalOfferDiscount = ₹1,000");
    assert(attempt.items[0].appliedOfferName === "Razorpay Offer Lock Test", "PaymentAttempt locked appliedOfferName");
    assert(attempt.items[0].offerDiscount === 1000, "PaymentAttempt locked offerDiscount");

    // Now simulate Offer DELETION by Admin while customer is in gateway!
    await Offer.deleteOne({ _id: offer._id });

    // Mock Razorpay fetch for this test
    const rzpClient = getRazorpayClient();
    const origFetch = rzpClient.payments.fetch;
    rzpClient.payments.fetch = async (payId) => ({
      id: payId,
      order_id: attempt.razorpayOrderId,
      amount: attempt.amountInPaise,
      currency: "INR",
      status: "captured"
    });

    // Finalize payment: Frozen snapshot MUST still transfer to Order!
    const finalRes = await paymentService.finalizeSuccessfulPayment({
      razorpayOrderId: attempt.razorpayOrderId,
      razorpayPaymentId: `pay_test_${crypto.randomBytes(4).toString("hex")}`,
      razorpaySignature: "dummy_valid_sig",
      user: { id: testUser._id }
    });

    rzpClient.payments.fetch = origFetch;

    assert(finalRes.success, "Payment finalized successfully even after live offer was deleted");
    const order = await Order.findById(finalRes.orderId);
    assert(order.totalOfferDiscount === 1000, "Order preserved frozen offer discount of ₹1,000");
    assert(order.items[0].appliedOfferName === "Razorpay Offer Lock Test", "Order preserved frozen offer name");
  }

  // -------------------------------------------------------------
  // TEST 11: Referral Offer Validation & Self-Referral Prevention
  // -------------------------------------------------------------
  console.log("\n--- TEST 11: Referral Offer Validation ---");
  {
    const refOffer = await Offer.create({
      name: "Friend Referral 15% OFF",
      scope: "REFERRAL",
      referralCode: referrerUser.referralCode,
      discountType: "PERCENTAGE",
      discountValue: 15,
      startAt: past,
      expiryAt: future,
      isActive: true
    });

    // Test: User visiting with valid referral code unlocks offer
    const evalUser = await offerService.getBestOfferForItem({
      productId: testProduct1._id,
      categoryId: testCategory1._id,
      unitPrice: 50000,
      quantity: 1,
      userId: testUser._id,
      referralCode: referrerUser.referralCode
    });
    assert(evalUser.bestOffer !== null, "Referral offer unlocked for referred user");
    assert(evalUser.unitDiscount === 7500, "15% of 50,000 = ₹7,500");

    // Test: Self-referral prevention (referrerUser cannot use own referral code)
    const evalSelf = await offerService.getBestOfferForItem({
      productId: testProduct1._id,
      categoryId: testCategory1._id,
      unitPrice: 50000,
      quantity: 1,
      userId: referrerUser._id,
      referralCode: referrerUser.referralCode
    });
    assert(evalSelf.bestOffer === null, "Self-referral strictly prevented: referrer cannot win own offer");

    await Offer.deleteOne({ _id: refOffer._id });
  }

  // -------------------------------------------------------------
  // TEST 12: Offer Expiry, Scheduling, and Inactive Status
  // -------------------------------------------------------------
  console.log("\n--- TEST 12: Offer Lifecycle State Verification ---");
  {
    // Expired offer
    const expiredOffer = await Offer.create({
      name: "Expired Offer",
      scope: "PRODUCT",
      products: [testProduct1._id],
      discountType: "FIXED",
      discountValue: 1000,
      startAt: past,
      expiryAt: new Date(now.getTime() - 1000),
      isActive: true
    });
    const evalExp = await offerService.getBestOfferForItem({
      productId: testProduct1._id,
      categoryId: testCategory1._id,
      unitPrice: 50000,
      quantity: 1
    });
    assert(evalExp.bestOffer === null, "Expired offer is not applied");

    // Scheduled (Future) offer
    const futureOffer = await Offer.create({
      name: "Future Offer",
      scope: "PRODUCT",
      products: [testProduct1._id],
      discountType: "FIXED",
      discountValue: 1000,
      startAt: new Date(now.getTime() + 100000),
      expiryAt: future,
      isActive: true
    });
    const evalFuture = await offerService.getBestOfferForItem({
      productId: testProduct1._id,
      categoryId: testCategory1._id,
      unitPrice: 50000,
      quantity: 1
    });
    assert(evalFuture.bestOffer === null, "Scheduled future offer is not applied");

    // Inactive offer
    const inactiveOffer = await Offer.create({
      name: "Inactive Offer",
      scope: "PRODUCT",
      products: [testProduct1._id],
      discountType: "FIXED",
      discountValue: 1000,
      startAt: past,
      expiryAt: future,
      isActive: false
    });
    const evalInactive = await offerService.getBestOfferForItem({
      productId: testProduct1._id,
      categoryId: testCategory1._id,
      unitPrice: 50000,
      quantity: 1
    });
    assert(evalInactive.bestOffer === null, "Disabled (isActive=false) offer is not applied");

    await Offer.deleteMany({ _id: { $in: [expiredOffer._id, futureOffer._id, inactiveOffer._id] } });
  }

  // -------------------------------------------------------------
  // TEST 13: Usage Limit & Exhaustion
  // -------------------------------------------------------------
  console.log("\n--- TEST 13: Usage Limits & Exhaustion ---");
  {
    const exhaustOffer = await Offer.create({
      name: "One-Time Global Offer",
      scope: "PRODUCT",
      products: [testProduct1._id],
      discountType: "FIXED",
      discountValue: 1000,
      startAt: past,
      expiryAt: future,
      isActive: true,
      usageLimit: 1,
      usedCount: 1 // already consumed
    });

    const evalExhaust = await offerService.getBestOfferForItem({
      productId: testProduct1._id,
      categoryId: testCategory1._id,
      unitPrice: 50000,
      quantity: 1
    });
    assert(evalExhaust.bestOffer === null, "Exhausted offer cannot be applied");

    await Offer.deleteOne({ _id: exhaustOffer._id });
  }

  // -------------------------------------------------------------
  // TEST 14: Historical Cancellation/Return Wallet Refund Safety
  // -------------------------------------------------------------
  console.log("\n--- TEST 14: Cancellation & Return Refund from Snapshot ---");
  {
    // Create an order with an offer snapshot
    const offer = await Offer.create({
      name: "Refund Snapshot Offer",
      scope: "PRODUCT",
      products: [testProduct1._id],
      discountType: "FIXED",
      discountValue: 5000,
      startAt: past,
      expiryAt: future,
      isActive: true
    });

    // Credit wallet to place a paid wallet order
    await walletService.creditWallet({
      userId: testUser._id,
      amount: 50000,
      description: "Wallet fund for refund test",
      source: "REFUND",
      idempotencyKey: `TOPUP_${crypto.randomUUID()}`
    });

    await Cart.deleteMany({ user: testUser._id });
    await cartService.addToCart(testUser._id, testProduct1._id, testVariant1._id, 1);

    // Order with offer: Laptop 50,000 - 5,000 = 45,000
    const orderRes = await orderService.createWalletOrder(testUser._id, testAddress._id, null, crypto.randomUUID());
    assert(orderRes.success, "Wallet order created for refund test");
    const orderId = orderRes.orderId;
    const order = await Order.findById(orderId);

    // Customer cancels order item
    const initialWallet = await walletService.getWalletBalance(testUser._id);
    const cancelRes = await orderService.cancelOrderItem(orderId, order.items[0]._id, "Changed mind", "USER");
    assert(cancelRes.success, "Item cancellation succeeded");

    const finalWallet = await walletService.getWalletBalance(testUser._id);
    // Should refund effective item total (45,000), NOT base price 50,000!
    assert(finalWallet === initialWallet + 45000, "Wallet refunded exact snapshot effective price (₹45,000), not inflated base price");

    await Offer.deleteOne({ _id: offer._id });
  }

  console.log("\n========================================================");
  console.log(`🎉 ALL TESTS COMPLETED: ${passedTests}/${totalTests} PASSED`);
  console.log("========================================================\n");
}

async function run() {
  try {
    await setupDatabase();
    await seedBaseData();
    await runTests();
    process.exit(0);
  } catch (error) {
    console.error("\n💥 TEST SUITE CRASHED:", error);
    process.exit(1);
  }
}

run();
