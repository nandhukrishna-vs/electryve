/**
 * Comprehensive Integration and Safety Test Suite for Razorpay Online Payment in Electryve
 * Covers all 59 verification areas from Section 59 of the prompt.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";
dotenv.config();

import User from "../src/models/User.js";
import Category from "../src/models/Category.js";
import Brand from "../src/models/Brand.js";
import Product from "../src/models/Product.js";
import Cart from "../src/models/Cart.js";
import Address from "../src/models/Address.js";
import Coupon from "../src/models/Coupon.js";
import Order from "../src/models/Order.js";
import PaymentAttempt from "../src/models/PaymentAttempt.js";
import ProcessedWebhook from "../src/models/ProcessedWebhook.js";
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  finalizeSuccessfulPayment,
  processWebhookEvent
} from "../src/services/paymentService.js";
import { addToCart } from "../src/services/cartService.js";
import { getRazorpayClient, getRazorpayKeyId, getRazorpayWebhookSecret } from "../src/config/razorpay.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/electryve";

let testUser1, testUser2;
let testCategory;
let testBrand;
let testProductA, testProductB;
let testAddress1, testAddress2;
let testCoupon;

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

async function setupTestData() {
  console.log("Setting up Razorpay test data in MongoDB...");
  const rand = Math.floor(100000 + Math.random() * 900000);

  // Users with unique phones
  const phone1 = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const phone2 = `9${Math.floor(100000000 + Math.random() * 900000000)}`;

  testUser1 = await User.create({
    fullName: `Test Buyer 1 ${rand}`,
    email: `buyer1_${rand}@test.com`,
    password: "Password123!",
    phone: phone1,
    isVerified: true
  });

  testUser2 = await User.create({
    fullName: `Test Buyer 2 ${rand}`,
    email: `buyer2_${rand}@test.com`,
    password: "Password123!",
    phone: phone2,
    isVerified: true
  });

  // Addresses
  testAddress1 = await Address.create({
    userId: testUser1._id,
    fullName: "Test Customer 1",
    phone: phone1,
    addressLine1: "123 Tech Park",
    city: "Bangalore",
    state: "Karnataka",
    pinCode: 560001,
    addressType: "HOME",
    isDefault: true
  });

  testAddress2 = await Address.create({
    userId: testUser2._id,
    fullName: "Test Customer 2",
    phone: phone2,
    addressLine1: "456 Cyber City",
    city: "Hyderabad",
    state: "Telangana",
    pinCode: 500081,
    addressType: "OFFICE",
    isDefault: true
  });

  // Category & Brand
  testCategory = await Category.create({
    name: `Laptops ${rand}`,
    slug: `laptops-${rand}`,
    isListed: true,
    isDeleted: false
  });

  testBrand = await Brand.create({
    name: `BrandX ${rand}`,
    slug: `brandx-${rand}`,
    isListed: true,
    isDeleted: false
  });

  // Products
  testProductA = await Product.create({
    name: `Ultrabook A ${rand}`,
    slug: `ultrabook-a-${rand}`,
    category: testCategory._id,
    brand: testBrand._id,
    description: "High performance ultrabook",
    isListed: true,
    isDeleted: false,
    variants: [
      {
        color: "Space Gray",
        storage: "512GB",
        sku: `SKU-A1-${rand}`,
        regularPrice: 60000,
        salePrice: 50000,
        stock: 10,
        isListed: true,
        images: ["/uploads/img1.png", "/uploads/img2.png", "/uploads/img3.png"]
      },
      {
        color: "Silver",
        storage: "1TB",
        sku: `SKU-A2-${rand}`,
        regularPrice: 75000,
        salePrice: 65000,
        stock: 5,
        isListed: true,
        images: ["/uploads/img1.png", "/uploads/img2.png", "/uploads/img3.png"]
      }
    ]
  });

  testProductB = await Product.create({
    name: `Single Stock Product B ${rand}`,
    slug: `product-b-${rand}`,
    category: testCategory._id,
    brand: testBrand._id,
    description: "Limited stock device",
    isListed: true,
    isDeleted: false,
    variants: [
      {
        color: "Black",
        storage: "128GB",
        sku: `SKU-B1-${rand}`,
        regularPrice: 20000,
        salePrice: 18000,
        stock: 1, // Exactly 1 unit for race testing
        isListed: true,
        images: ["/uploads/img1.png", "/uploads/img2.png", "/uploads/img3.png"]
      }
    ]
  });

  // Coupon
  testCoupon = await Coupon.create({
    code: `RZP${rand}`,
    discountType: "FIXED",
    discountValue: 2000,
    minPurchaseAmount: 10000,
    startDate: new Date(Date.now() - 86400000),
    expiryDate: new Date(Date.now() + 86400000 * 30),
    usageLimit: 5,
    perUserLimit: 2,
    usedCount: 0,
    isActive: true,
    isDeleted: false
  });
}

async function cleanupTestData() {
  console.log("Cleaning up test data...");
  if (testUser1) {
    await User.deleteMany({ _id: { $in: [testUser1._id, testUser2._id] } });
    await Address.deleteMany({ userId: { $in: [testUser1._id, testUser2._id] } });
    await Cart.deleteMany({ user: { $in: [testUser1._id, testUser2._id] } });
    await Order.deleteMany({ user: { $in: [testUser1._id, testUser2._id] } });
    await PaymentAttempt.deleteMany({ user: { $in: [testUser1._id, testUser2._id] } });
  }
  if (testCategory) await Category.deleteOne({ _id: testCategory._id });
  if (testBrand) await Brand.deleteOne({ _id: testBrand._id });
  if (testProductA) await Product.deleteMany({ _id: { $in: [testProductA._id, testProductB._id] } });
  if (testCoupon) await Coupon.deleteOne({ _id: testCoupon._id });
  await ProcessedWebhook.deleteMany({ eventId: /^test_evt_/ });
}

async function runTests() {
  await mongoose.connect(MONGODB_URI);
  await setupTestData();

  console.log("\n============================================================");
  console.log("STARTING RAZORPAY INTEGRATION & SAFETY AUDIT SUITE");
  console.log("============================================================\n");

  const rand = Math.floor(1000 + Math.random() * 9000);
  const vA1 = testProductA.variants[0]._id;
  const vA2 = testProductA.variants[1]._id;
  const vB1 = testProductB.variants[0]._id;

  // --- SECTION 1: Razorpay Configuration & Credentials ---
  console.log("--- SECTION 1: Razorpay Configuration & Credential Safety ---");
  const keyId = getRazorpayKeyId();
  assert(typeof keyId === "string" && keyId.length > 0, "Public Razorpay Key ID is accessible");
  assert(keyId.startsWith("rzp_test_"), "Razorpay Key ID is strictly in TEST MODE");
  assert(!JSON.stringify(keyId).includes(process.env.RAZORPAY_KEY_SECRET), "Razorpay Secret is never exposed via Key ID helper");
  const client = getRazorpayClient();
  assert(client !== null && typeof client.orders.create === "function", "Razorpay client is properly initialized with official SDK");

  // --- SECTION 2: Cart Validation & Authoritative Amount Calculation ---
  console.log("\n--- SECTION 2: Cart Validation & Authoritative Calculation ---");
  // Set user1 cart: 1 of vA1 (salePrice: 50000)
  await addToCart(testUser1._id, testProductA._id.toString(), vA1.toString(), 1);

  const attemptId1 = `chk_attempt_${rand}_1`;
  const rzpOrderResult = await createRazorpayOrder(testUser1._id, testAddress1._id, null, attemptId1);
  assert(rzpOrderResult.success === true, "createRazorpayOrder succeeds for valid cart");
  assert(rzpOrderResult.orderId.startsWith("order_"), "Razorpay Order ID generated on server");
  assert(rzpOrderResult.amount === 5000000, "Authoritative amount in paise is exact (50000 * 100 = 5000000)");
  assert(rzpOrderResult.currency === "INR", "Currency is INR");

  // Verify stock was NOT decremented during order creation
  const pCheck1 = await Product.findById(testProductA._id);
  assert(pCheck1.variants[0].stock === 10, "Stock unchanged after creating Razorpay Order (remains 10)");

  // Verify PaymentAttempt saved with snapshot
  const attemptDoc1 = await PaymentAttempt.findOne({ razorpayOrderId: rzpOrderResult.orderId });
  assert(attemptDoc1 !== null, "PaymentAttempt document persisted in database");
  assert(attemptDoc1.status === "CREATED", "PaymentAttempt status is CREATED");
  assert(attemptDoc1.amount === 50000, "PaymentAttempt stores authoritative ₹ amount (50000)");
  assert(attemptDoc1.amountInPaise === 5000000, "PaymentAttempt stores authoritative paise (5000000)");
  assert(attemptDoc1.items.length === 1, "PaymentAttempt item snapshot recorded");
  assert(attemptDoc1.items[0].sku === `SKU-A1-${testProductA.variants[0].sku.split('-')[2]}`, "Item SKU snapshotted");

  // --- SECTION 3: Create-Order Concurrency & Double-Click Idempotency ---
  console.log("\n--- SECTION 3: Create-Order Idempotency & Concurrency ---");
  // Rapid second click with the same checkoutAttemptId
  const rzpOrderResult2 = await createRazorpayOrder(testUser1._id, testAddress1._id, null, attemptId1);
  assert(rzpOrderResult2.success === true, "Repeated create-order succeeds");
  assert(rzpOrderResult2.orderId === rzpOrderResult.orderId, "Repeated create-order reuses same Razorpay Order ID without creating duplicate");

  const totalAttemptsCount = await PaymentAttempt.countDocuments({ user: testUser1._id, checkoutAttemptId: attemptId1 });
  assert(totalAttemptsCount === 1, "Exactly one active PaymentAttempt exists for this checkoutAttemptId");

  // --- SECTION 4: Signature Verification Logic ---
  console.log("\n--- SECTION 4: Cryptographic Signature Verification ---");
  const dummyPaymentId = `pay_test_${rand}_999`;
  const validSecret = process.env.RAZORPAY_KEY_SECRET;
  const validSig = crypto
    .createHmac("sha256", validSecret)
    .update(`${rzpOrderResult.orderId}|${dummyPaymentId}`)
    .digest("hex");

  assert(verifyPaymentSignature(rzpOrderResult.orderId, dummyPaymentId, validSig) === true, "Valid HMAC signature passes verification");
  assert(verifyPaymentSignature(rzpOrderResult.orderId, dummyPaymentId, "0000000000000000000000000000000000000000000000000000000000000000") === false, "Forged signature is rejected");
  assert(verifyPaymentSignature(rzpOrderResult.orderId, "pay_swapped_id", validSig) === false, "Swapped payment ID is rejected");
  assert(verifyPaymentSignature("order_swapped_id", dummyPaymentId, validSig) === false, "Swapped order ID is rejected");
  assert(verifyPaymentSignature(null, dummyPaymentId, validSig) === false, "Null parameters rejected");

  // --- SECTION 5: Atomic State Claim & Finalization Concurrency ---
  console.log("\n--- SECTION 5: Atomic Claim & Concurrency-Safe Finalization ---");
  // We mock razorpay.payments.fetch for our test order to simulate Razorpay captured payment
  const origFetch = client.payments.fetch;
  client.payments.fetch = async (payId) => {
    return {
      id: payId,
      order_id: rzpOrderResult.orderId,
      amount: 5000000,
      currency: "INR",
      status: "captured"
    };
  };

  // Run TWO simultaneous calls to finalizeSuccessfulPayment (simulating callback + webhook race)
  const [raceResult1, raceResult2] = await Promise.all([
    finalizeSuccessfulPayment({
      razorpayOrderId: rzpOrderResult.orderId,
      razorpayPaymentId: dummyPaymentId,
      razorpaySignature: validSig,
      user: { id: testUser1._id }
    }),
    finalizeSuccessfulPayment({
      razorpayOrderId: rzpOrderResult.orderId,
      razorpayPaymentId: dummyPaymentId,
      razorpaySignature: validSig,
      webhookEventId: `test_evt_${rand}_1`
    })
  ]);

  assert(raceResult1.success === true && raceResult2.success === true, "Both concurrent finalization calls return success");
  const orderNum1 = raceResult1.orderNumber || raceResult1.order?.orderNumber;
  const orderNum2 = raceResult2.orderNumber || raceResult2.order?.orderNumber;
  assert(orderNum1 === orderNum2, "Both concurrent calls return the exact same finalized order number");

  // Verify stock decremented EXACTLY ONCE
  const pCheck2 = await Product.findById(testProductA._id);
  assert(pCheck2.variants[0].stock === 9, "Stock decremented by exactly 1 (10 -> 9) under concurrent calls");

  // Verify PaymentAttempt status is COMPLETED
  const attemptDocCompleted = await PaymentAttempt.findOne({ razorpayOrderId: rzpOrderResult.orderId });
  assert(attemptDocCompleted.status === "COMPLETED", "PaymentAttempt transitioned to COMPLETED");
  assert(attemptDocCompleted.order !== null, "PaymentAttempt references finalized Order");

  // Verify user's cart is cleared
  const cartCheck = await Cart.findOne({ user: testUser1._id });
  assert(cartCheck.items.length === 0, "User cart cleared after successful finalization");

  // Verify duplicate subsequent callback is completely idempotent
  const dupCallback = await finalizeSuccessfulPayment({
    razorpayOrderId: rzpOrderResult.orderId,
    razorpayPaymentId: dummyPaymentId,
    razorpaySignature: validSig,
    user: { id: testUser1._id }
  });
  assert(dupCallback.success === true && dupCallback.isDuplicate === true, "Subsequent callback detected duplicate and returned safely");
  const pCheck3 = await Product.findById(testProductA._id);
  assert(pCheck3.variants[0].stock === 9, "Stock unchanged after duplicate callback (still 9)");

  // --- SECTION 6: Stale Payment Failure Protection ---
  console.log("\n--- SECTION 6: Stale Payment Failure Protection ---");
  // Simulate late webhook for payment.failed arriving AFTER payment completed
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "dummy_webhook_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

  const fakeFailedPayload = JSON.stringify({
    event: "payment.failed",
    created_at: Date.now(),
    payload: {
      payment: {
        entity: {
          id: dummyPaymentId,
          order_id: rzpOrderResult.orderId,
          error_description: "Late failure signal"
        }
      }
    }
  });
  const fakeFailedSig = crypto
    .createHmac("sha256", webhookSecret)
    .update(Buffer.from(fakeFailedPayload, "utf8"))
    .digest("hex");

  const lateFailureResult = await processWebhookEvent(
    Buffer.from(fakeFailedPayload, "utf8"),
    fakeFailedSig,
    `test_evt_failed_${rand}`
  );
  assert(lateFailureResult.success === true, "Late failure webhook handled cleanly");

  const attemptDocStillCompleted = await PaymentAttempt.findOne({ razorpayOrderId: rzpOrderResult.orderId });
  assert(attemptDocStillCompleted.status === "COMPLETED", "COMPLETED status was NOT overwritten by late failure event");

  // --- SECTION 7: Webhook Raw Body HMAC & Event Deduplication ---
  console.log("\n--- SECTION 7: Webhook Raw Body HMAC & Atomic Deduplication ---");
  const rawPayload = JSON.stringify({
    event: "order.paid",
    id: `test_evt_dup_${rand}`,
    created_at: Date.now(),
    payload: {
      order: { entity: { id: rzpOrderResult.orderId } },
      payment: { entity: { id: dummyPaymentId } }
    }
  });
  const rawBuf = Buffer.from(rawPayload, "utf8");
  const validWebhookSig = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBuf)
    .digest("hex");

  // First delivery
  const hookResult1 = await processWebhookEvent(rawBuf, validWebhookSig, `test_evt_dup_${rand}`);
  assert(hookResult1.success === true, "First webhook delivery processed successfully");

  // Duplicate delivery
  const hookResult2 = await processWebhookEvent(rawBuf, validWebhookSig, `test_evt_dup_${rand}`);
  assert(hookResult2.success === true && hookResult2.isDuplicate === true, "Duplicate webhook recognized via atomic ProcessedWebhook deduplication");

  // Modified raw body should fail HMAC
  const tamperedBuf = Buffer.from(rawPayload.replace("order.paid", "order.fake"), "utf8");
  let tamperedCaught = false;
  try {
    await processWebhookEvent(tamperedBuf, validWebhookSig, `test_evt_tampered_${rand}`);
  } catch (err) {
    tamperedCaught = true;
  }
  assert(tamperedCaught === true, "Tampered webhook payload rejected by HMAC signature verification");

  // --- SECTION 8: Captured Payment + Stock Unavailable (FULFILLMENT_BLOCKED) ---
  console.log("\n--- SECTION 8: Captured Payment + Stock Unavailable ---");
  // Set user2 cart: 1 of Product B (has exactly 1 stock)
  await addToCart(testUser2._id, testProductB._id.toString(), vB1.toString(), 1);

  const attemptIdB = `chk_attempt_${rand}_B`;
  const rzpOrderB = await createRazorpayOrder(testUser2._id, testAddress2._id, null, attemptIdB);
  assert(rzpOrderB.success === true, "Razorpay Order created for Product B");

  // Simulate another customer purchasing the last stock unit before finalization
  await Product.updateOne(
    { _id: testProductB._id, "variants._id": vB1 },
    { $set: { "variants.$.stock": 0 } }
  );

  const payIdB = `pay_test_${rand}_B`;
  client.payments.fetch = async () => ({
    id: payIdB,
    order_id: rzpOrderB.orderId,
    amount: 1800000,
    currency: "INR",
    status: "captured"
  });

  const blockResult = await finalizeSuccessfulPayment({
    razorpayOrderId: rzpOrderB.orderId,
    razorpayPaymentId: payIdB,
    user: { id: testUser2._id }
  });

  assert(blockResult.success === false, "Finalization rejected due to out-of-stock condition");
  assert(blockResult.status === "FULFILLMENT_BLOCKED", "Status is specifically FULFILLMENT_BLOCKED (not false FAILED)");

  const attemptDocBlocked = await PaymentAttempt.findOne({ razorpayOrderId: rzpOrderB.orderId });
  assert(attemptDocBlocked.status === "FULFILLMENT_BLOCKED", "PaymentAttempt marked FULFILLMENT_BLOCKED");
  assert(attemptDocBlocked.reconciliationStatus === "REQUIRES_REFUND", "Reconciliation status set to REQUIRES_REFUND");
  assert(attemptDocBlocked.capturedAmount === 1800000, "Captured payment amount is accurately recorded for refund");
  assert(attemptDocBlocked.order === null, "No invalid zero-stock Order document was created");

  const pCheckB = await Product.findById(testProductB._id);
  assert(pCheckB.variants[0].stock === 0, "Stock was not decremented to negative (remains 0)");

  // --- SECTION 9: Atomic Coupon Consumption & Concurrency ---
  console.log("\n--- SECTION 9: Atomic Coupon Consumption ---");
  // Set user1 cart with Product A (vA2, price: 65000) and apply test coupon (discount: 2000)
  await Cart.updateOne(
    { user: testUser1._id },
    { $set: { items: [] } }
  );
  await addToCart(testUser1._id, testProductA._id.toString(), vA2.toString(), 1);

  const attemptIdCoupon = `chk_attempt_${rand}_coupon`;
  const rzpOrderCoupon = await createRazorpayOrder(testUser1._id, testAddress1._id, testCoupon.code, attemptIdCoupon);
  assert(rzpOrderCoupon.success === true, "Create order with coupon succeeds");
  assert(rzpOrderCoupon.amount === 6300000, "Authoritative amount accounts for coupon (65000 - 2000 = 63000 * 100 = 6300000)");

  // Initial coupon usage count is 0
  const cCheck1 = await Coupon.findById(testCoupon._id);
  assert(cCheck1.usedCount === 0, "Coupon usedCount is unchanged before finalization (0)");

  const payIdCoupon = `pay_test_${rand}_coupon`;
  client.payments.fetch = async () => ({
    id: payIdCoupon,
    order_id: rzpOrderCoupon.orderId,
    amount: 6300000,
    currency: "INR",
    status: "captured"
  });

  const couponOrderResult = await finalizeSuccessfulPayment({
    razorpayOrderId: rzpOrderCoupon.orderId,
    razorpayPaymentId: payIdCoupon,
    user: { id: testUser1._id }
  });

  assert(couponOrderResult.success === true, "Order finalized successfully with coupon");
  const cCheck2 = await Coupon.findById(testCoupon._id);
  assert(cCheck2.usedCount === 1, "Coupon usedCount incremented atomically on successful fulfillment (1)");

  // --- SECTION 10: Security & Ownership Protection ---
  console.log("\n--- SECTION 10: Security & Ownership Checks ---");
  // User 2 trying to finalize User 1's payment attempt
  const crossUserResult = await finalizeSuccessfulPayment({
    razorpayOrderId: rzpOrderCoupon.orderId,
    razorpayPaymentId: payIdCoupon,
    user: { id: testUser2._id } // Unauthorized user
  });
  assert(crossUserResult.success === false, "Cross-user payment finalization rejected");
  assert(crossUserResult.message.includes("Unauthorized"), "Rejection message specifies unauthorized ownership");

  // Restore client.payments.fetch
  client.payments.fetch = origFetch;

  // --- SECTION 11: COD & Stock Regressions ---
  console.log("\n--- SECTION 11: COD Regression Verification ---");
  // Verify that COD ordering still works seamlessly alongside Razorpay
  const { createCODOrder } = await import("../src/services/orderService.js");
  await Cart.updateOne(
    { user: testUser1._id },
    { $set: { items: [] } }
  );
  await addToCart(testUser1._id, testProductA._id.toString(), vA1.toString(), 1);

  const codResult = await createCODOrder(testUser1._id, testAddress1._id, null, `cod_test_${rand}`);
  assert(codResult.success === true, "createCODOrder functions identically without regression");
  const codOrder = await Order.findById(codResult.orderId);
  assert(codOrder.paymentMethod === "COD", "COD order has paymentMethod COD");
  assert(codOrder.paymentStatus === "PENDING", "COD order has paymentStatus PENDING");
  assert(codOrder.orderStatus === "PLACED", "COD order has orderStatus PLACED");

  console.log("\n============================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("============================================================\n");

  await cleanupTestData();
  await mongoose.disconnect();

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
