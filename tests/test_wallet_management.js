/**
 * Integration Test Suite for Electryve Wallet Management, Wallet Refunds & Wallet Checkout
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
import WalletTransaction from "../src/models/WalletTransaction.js";

import * as walletService from "../src/services/walletService.js";
import * as orderService from "../src/services/orderService.js";

let testUser = null;
let testAddress = null;
let testCategory = null;
let testBrand = null;
let testProduct = null;
let testVariant = null;

let passedTests = 0;
let totalTests = 0;

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
  console.log("Connected to MongoDB for testing.");
}

async function seedBaseData() {
  const randomSuffix = crypto.randomBytes(4).toString("hex");

  // Create User
  testUser = await User.create({
    fullName: `Wallet User ${randomSuffix}`,
    email: `wallet_${randomSuffix}@test.com`,
    password: "Password@123",
    phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
    isVerified: true
  });

  // Create Address
  testAddress = await Address.create({
    userId: testUser._id,
    fullName: testUser.fullName,
    phone: testUser.phone,
    addressLine1: "123 Test St",
    city: "Kochi",
    state: "Kerala",
    pinCode: 682001,
    isDefault: true
  });

  // Create Category & Brand
  testCategory = await Category.create({
    name: `Category ${randomSuffix}`,
    slug: `cat-${randomSuffix}`,
    isListed: true,
    isDeleted: false
  });

  testBrand = await Brand.create({
    name: `Brand ${randomSuffix}`,
    slug: `brand-${randomSuffix}`,
    isListed: true,
    isDeleted: false
  });

  // Create Product with variants
  testProduct = await Product.create({
    name: `Product ${randomSuffix}`,
    slug: `product-${randomSuffix}`,
    brand: testBrand._id,
    category: testCategory._id,
    description: "Test product for wallet",
    isListed: true,
    isDeleted: false,
    variants: [
      {
        sku: `SKU-${randomSuffix}-1`,
        color: "Black",
        storage: "128GB",
        regularPrice: 2000,
        salePrice: 1500,
        offerDiscount: 500,
        stock: 50,
        images: ["/uploads/test1.jpg", "/uploads/test2.jpg", "/uploads/test3.jpg"],
        isListed: true
      }
    ]
  });
  testVariant = testProduct.variants[0];
}

async function runWalletCoreTests() {
  console.log("\n--- SECTION 1: WALLET CORE OPERATIONS ---");

  // 1. Auto-create wallet
  const wallet1 = await walletService.getOrCreateWallet(testUser._id);
  assert(wallet1 !== null, "Wallet auto-created successfully");
  assert(wallet1.balance === 0, "Initial wallet balance is 0");

  const wallet2 = await walletService.getOrCreateWallet(testUser._id);
  assert(wallet1._id.toString() === wallet2._id.toString(), "getOrCreateWallet returns existing wallet");

  // 2. Credit Wallet
  const credKey1 = `TEST_CREDIT_${Date.now()}`;
  const credRes = await walletService.creditWallet({
    userId: testUser._id,
    amount: 1000,
    source: "REFUND",
    description: "Test initial credit",
    idempotencyKey: credKey1
  });
  assert(credRes.success && credRes.transaction.amount === 1000, "Credit transaction amount is 1000");
  assert(credRes.balance === 1000, "Balance after credit is 1000");

  const balanceAfterCred = await walletService.getWalletBalance(testUser._id);
  assert(balanceAfterCred === 1000, "Wallet balance reflects credited amount (1000)");

  // 3. Idempotent Credit (same key)
  const credResDup = await walletService.creditWallet({
    userId: testUser._id,
    amount: 1000,
    source: "REFUND",
    description: "Duplicate credit attempt",
    idempotencyKey: credKey1
  });
  assert(credResDup.isDuplicate === true, "Duplicate credit identified as existing transaction");
  const balanceAfterDupCred = await walletService.getWalletBalance(testUser._id);
  assert(balanceAfterDupCred === 1000, "Balance not changed by duplicate credit attempt");

  // 4. Debit Wallet
  const debKey1 = `TEST_DEBIT_${Date.now()}`;
  const debRes = await walletService.debitWallet({
    userId: testUser._id,
    amount: 400,
    source: "ORDER_PAYMENT",
    description: "Test partial debit",
    idempotencyKey: debKey1
  });
  assert(debRes.success && debRes.transaction.amount === 400, "Debit transaction amount is 400");
  assert(debRes.balance === 600, "Balance after debit is 600");

  // 5. Idempotent Debit (same key)
  const debResDup = await walletService.debitWallet({
    userId: testUser._id,
    amount: 400,
    source: "ORDER_PAYMENT",
    description: "Duplicate debit attempt",
    idempotencyKey: debKey1
  });
  assert(debResDup.isDuplicate === true, "Duplicate debit identified as existing transaction");
  const balanceAfterDupDeb = await walletService.getWalletBalance(testUser._id);
  assert(balanceAfterDupDeb === 600, "Balance not changed by duplicate debit attempt");

  // 6. Insufficient Balance Rejection
  const debFailRes = await walletService.debitWallet({
    userId: testUser._id,
    amount: 800, // Balance is 600
    source: "ORDER_PAYMENT",
    description: "Excess debit attempt",
    idempotencyKey: `TEST_DEBIT_FAIL_${Date.now()}`
  });
  assert(!debFailRes.success && debFailRes.code === "INSUFFICIENT_WALLET_BALANCE", "Debit exceeding balance rejected with INSUFFICIENT_WALLET_BALANCE");
  const balanceAfterFail = await walletService.getWalletBalance(testUser._id);
  assert(balanceAfterFail === 600, "Balance unchanged after rejected debit");

  // 7. Exact Balance Debit
  const debExact = await walletService.debitWallet({
    userId: testUser._id,
    amount: 600,
    source: "ORDER_PAYMENT",
    description: "Debit exact balance",
    idempotencyKey: `TEST_DEBIT_EXACT_${Date.now()}`
  });
  assert(debExact.success && debExact.balance === 0, "Exact balance debit leaves wallet balance at 0");

  // 8. Concurrent Debit Race Protection
  // Credit 500
  await walletService.creditWallet({
    userId: testUser._id,
    amount: 500,
    source: "REFUND",
    description: "Fund for race condition test",
    idempotencyKey: `TEST_RACE_FUND_${Date.now()}`
  });

  // Launch 3 concurrent debits of 300 each (total 900 requested on 500 balance)
  const results = await Promise.all([
    walletService.debitWallet({
      userId: testUser._id,
      amount: 300,
      source: "ORDER_PAYMENT",
      description: "Race debit 1",
      idempotencyKey: `RACE_1_${Date.now()}`
    }),
    walletService.debitWallet({
      userId: testUser._id,
      amount: 300,
      source: "ORDER_PAYMENT",
      description: "Race debit 2",
      idempotencyKey: `RACE_2_${Date.now()}`
    }),
    walletService.debitWallet({
      userId: testUser._id,
      amount: 300,
      source: "ORDER_PAYMENT",
      description: "Race debit 3",
      idempotencyKey: `RACE_3_${Date.now()}`
    })
  ]);

  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  assert(succeeded.length === 1, "Exactly 1 concurrent debit succeeded (300 out of 500)");
  assert(failed.length === 2, "Other 2 concurrent debits failed cleanly");
  const balanceAfterRace = await walletService.getWalletBalance(testUser._id);
  assert(balanceAfterRace === 200, "Balance safely decremented to 200 without negative balance");
}

async function runCancellationRefundTests() {
  console.log("\n--- SECTION 2: CANCELLATION REFUNDS ---");

  // Helper to create an order
  async function createTestOrder(paymentMethod, paymentStatus) {
    const orderNumber = `ORD-TEST-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    return await Order.create({
      orderNumber,
      user: testUser._id,
      items: [
        {
          product: testProduct._id,
          variantId: testVariant._id,
          sku: testVariant.sku,
          productName: testProduct.name,
          variantDetails: "Black / 128GB",
          image: "/uploads/test1.jpg",
          brandName: testBrand.name,
          categoryName: testCategory.name,
          regularPrice: 2000,
          salePrice: 1500,
          offerDiscount: 500,
          couponDiscount: 0,
          quantity: 2,
          itemTotal: 3000,
          itemStatus: "ACTIVE",
          isStockRestored: false
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
      paymentMethod,
      paymentStatus,
      subtotal: 3000,
      discount: 1000,
      shippingCharge: 0,
      tax: 0,
      finalAmount: 3000,
      orderStatus: "PLACED",
      isStockRestored: false,
      idempotencyKey: `ORD_IDEM_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`
    });
  }

  // 1. Cancel COD Order: stock restored, NO wallet refund
  const initialWallet = await walletService.getWalletBalance(testUser._id);
  const codOrder = await createTestOrder("COD", "PENDING");
  const cancelCodRes = await orderService.cancelOrder(codOrder._id, testUser._id, "Changed mind");
  assert(cancelCodRes.success, "COD order cancelled successfully");
  assert(!cancelCodRes.refund?.credited, "No refund issued for COD order");
  const walletAfterCodCancel = await walletService.getWalletBalance(testUser._id);
  assert(walletAfterCodCancel === initialWallet, "Wallet balance unchanged after COD cancellation");

  // 2. Cancel Razorpay Paid Order: stock restored, 3000 credited to Wallet
  const rzpOrder = await createTestOrder("RAZORPAY", "COMPLETED");
  const cancelRzpRes = await orderService.cancelOrder(rzpOrder._id, testUser._id, "Customer cancellation");
  assert(cancelRzpRes.success, "Razorpay paid order cancelled successfully");
  assert(cancelRzpRes.refund?.credited === true, "Refund issued for Razorpay paid order");
  assert(cancelRzpRes.refund?.amount === 3000, "Refund amount matches order finalAmount (3000)");

  const walletAfterRzpCancel = await walletService.getWalletBalance(testUser._id);
  assert(walletAfterRzpCancel === initialWallet + 3000, "Wallet credited with 3000 after Razorpay cancellation");

  const updatedRzpOrder = await Order.findById(rzpOrder._id);
  assert(updatedRzpOrder.refundStatus === "COMPLETED", "Order refundStatus updated to COMPLETED");
  assert(updatedRzpOrder.refundMethod === "WALLET", "Order refundMethod recorded as WALLET");
  assert(updatedRzpOrder.refundAmount === 3000, "Order refundAmount recorded as 3000");

  // 3. Cancel Wallet Paid Order: stock restored, 3000 credited back to Wallet
  const walletOrder = await createTestOrder("WALLET", "COMPLETED");
  const cancelWalletRes = await orderService.cancelOrder(walletOrder._id, testUser._id, "Wallet order cancel");
  assert(cancelWalletRes.success, "Wallet paid order cancelled successfully");
  assert(cancelWalletRes.refund?.credited === true, "Refund issued for Wallet paid order");

  const walletAfterWalletCancel = await walletService.getWalletBalance(testUser._id);
  assert(walletAfterWalletCancel === initialWallet + 6000, "Wallet credited with 3000 after Wallet order cancellation");

  // 4. Item-Level Cancellation with proportional refund
  const multiItemOrder = await Order.create({
    orderNumber: `ORD-MULTI-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    user: testUser._id,
    items: [
      {
        product: testProduct._id,
        variantId: testVariant._id,
        sku: `${testVariant.sku}-A`,
        productName: "Item A",
        variantDetails: "Variant A",
        image: "/uploads/test1.jpg",
        brandName: testBrand.name,
        categoryName: testCategory.name,
        regularPrice: 1000,
        salePrice: 1000,
        quantity: 1,
        itemTotal: 1000,
        itemStatus: "ACTIVE",
        isStockRestored: false
      },
      {
        product: testProduct._id,
        variantId: testVariant._id,
        sku: `${testVariant.sku}-B`,
        productName: "Item B",
        variantDetails: "Variant B",
        image: "/uploads/test1.jpg",
        brandName: testBrand.name,
        categoryName: testCategory.name,
        regularPrice: 2000,
        salePrice: 2000,
        quantity: 1,
        itemTotal: 2000,
        itemStatus: "ACTIVE",
        isStockRestored: false
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
    paymentMethod: "RAZORPAY",
    paymentStatus: "COMPLETED",
    subtotal: 3000,
    discount: 0,
    couponDiscount: 300, // 10% coupon discount
    shippingCharge: 0,
    tax: 0,
    finalAmount: 2700,
    orderStatus: "PLACED",
    isStockRestored: false,
    idempotencyKey: `MULTI_IDEM_${Date.now()}`
  });

  const itemA = multiItemOrder.items[0];
  const balanceBeforeItemCancel = await walletService.getWalletBalance(testUser._id);
  const cancelItemRes = await orderService.cancelOrderItem(multiItemOrder._id, itemA._id, testUser._id, "Cancel item A only");
  assert(cancelItemRes.success, "Item A cancelled successfully");
  assert(cancelItemRes.refund?.credited === true, "Refund issued for cancelled item");
  // Item A is 1000/3000 of 2700 = 900
  assert(cancelItemRes.refund?.amount === 900, "Item A refund is proportional to coupon (900)");

  const balanceAfterItemCancel = await walletService.getWalletBalance(testUser._id);
  assert(balanceAfterItemCancel === balanceBeforeItemCancel + 900, "Wallet received exact proportional refund (900)");
}

async function runReturnRefundTests() {
  console.log("\n--- SECTION 3: RETURN REQUESTS & REFUNDS ---");

  // Helper to create a DELIVERED paid order
  async function createDeliveredOrder(paymentMethod = "RAZORPAY") {
    return await Order.create({
      orderNumber: `ORD-RET-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      user: testUser._id,
      items: [
        {
          product: testProduct._id,
          variantId: testVariant._id,
          sku: testVariant.sku,
          productName: testProduct.name,
          variantDetails: "Black / 128GB",
          image: "/uploads/test1.jpg",
          brandName: testBrand.name,
          categoryName: testCategory.name,
          regularPrice: 2000,
          salePrice: 1500,
          offerDiscount: 500,
          quantity: 1,
          itemTotal: 1500,
          itemStatus: "ACTIVE",
          isStockRestored: false
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
      paymentMethod,
      paymentStatus: "COMPLETED",
      subtotal: 1500,
      discount: 500,
      shippingCharge: 0,
      tax: 0,
      finalAmount: 1500,
      orderStatus: "DELIVERED",
      deliveredAt: new Date(),
      isStockRestored: false,
      idempotencyKey: `RET_IDEM_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`
    });
  }

  // 1. Return Requested (PENDING) -> No Refund
  const retOrder1 = await createDeliveredOrder("RAZORPAY");
  const balanceBeforeRetReq = await walletService.getWalletBalance(testUser._id);
  await orderService.requestReturn(retOrder1._id, testUser._id, "Item defective");
  const balanceAfterRetReq = await walletService.getWalletBalance(testUser._id);
  assert(balanceAfterRetReq === balanceBeforeRetReq, "No refund on return request creation (PENDING)");

  // 2. Return Rejected -> No Refund
  await orderService.rejectReturnRequest(retOrder1._id, "Policy expired");
  const balanceAfterReject = await walletService.getWalletBalance(testUser._id);
  assert(balanceAfterReject === balanceBeforeRetReq, "No refund when return is rejected");

  // 3. Return Approved for Paid Order -> Refund Issued to Wallet
  const retOrder2 = await createDeliveredOrder("RAZORPAY");
  await orderService.requestReturn(retOrder2._id, testUser._id, "Wrong size received");
  const balanceBeforeApprove = await walletService.getWalletBalance(testUser._id);
  const approveRes = await orderService.approveReturnRequest(retOrder2._id);
  assert(approveRes.success, "Return approved successfully");
  assert(approveRes.refund?.credited === true, "Refund issued on return approval for paid order");
  assert(approveRes.refund?.amount === 1500, "Refund amount matches order finalAmount (1500)");

  const balanceAfterApprove = await walletService.getWalletBalance(testUser._id);
  assert(balanceAfterApprove === balanceBeforeApprove + 1500, "Wallet balance increased by 1500 upon return approval");

  // 4. Repeated Approval Idempotency
  const dupApproveRes = await orderService.approveReturnRequest(retOrder2._id);
  assert(!dupApproveRes.success, "Repeated return approval rejected cleanly");
  const balanceAfterDupApprove = await walletService.getWalletBalance(testUser._id);
  assert(balanceAfterDupApprove === balanceAfterApprove, "No double refund on repeated return approval");

  // 5. COD Return Approval -> Stock restored, NO wallet refund
  const codRetOrder = await createDeliveredOrder("COD");
  await orderService.requestReturn(codRetOrder._id, testUser._id, "COD item issue");
  const balanceBeforeCodApprove = await walletService.getWalletBalance(testUser._id);
  const approveCodRes = await orderService.approveReturnRequest(codRetOrder._id);
  assert(approveCodRes.success, "COD return approved");
  assert(!approveCodRes.refund?.credited, "No refund issued for COD return");
  const balanceAfterCodApprove = await walletService.getWalletBalance(testUser._id);
  assert(balanceAfterCodApprove === balanceBeforeCodApprove, "Wallet balance unchanged for COD return approval");
}

async function runWalletCheckoutTests() {
  console.log("\n--- SECTION 4: WALLET CHECKOUT & ORDER PLACEMENT ---");

  // Clear user cart first
  await Cart.deleteMany({ user: testUser._id });

  // Add 1 item to cart
  await Cart.create({
    user: testUser._id,
    items: [
      {
        product: testProduct._id,
        variantId: testVariant._id,
        quantity: 1,
        price: 1500,
        priceSnapshot: 1500,
        nameSnapshot: testProduct.name,
        variantSnapshot: "Black / 128GB",
        imageSnapshot: "/uploads/test1.jpg"
      }
    ]
  });

  // Ensure user wallet balance is 500 (less than 1500)
  const currentBal = await walletService.getWalletBalance(testUser._id);
  if (currentBal > 500) {
    await walletService.debitWallet({
      userId: testUser._id,
      amount: currentBal - 500,
      source: "ORDER_PAYMENT",
      description: "Balance adjust for test",
      idempotencyKey: `ADJUST_${Date.now()}`
    });
  } else if (currentBal < 500) {
    await walletService.creditWallet({
      userId: testUser._id,
      amount: 500 - currentBal,
      source: "REFUND",
      description: "Balance adjust for test",
      idempotencyKey: `ADJUST_${Date.now()}`
    });
  }
  const balBeforeInsuff = await walletService.getWalletBalance(testUser._id);
  assert(balBeforeInsuff === 500, "Wallet balance set to 500 for insufficient test");

  // 1. Attempt Wallet Order with Insufficient Balance (Order total is 1500)
  const failRes = await orderService.createWalletOrder({
    userId: testUser._id,
    addressId: testAddress._id,
    checkoutAttemptId: `CHK_FAIL_${Date.now()}`
  });
  assert(!failRes.success && failRes.message.includes("Insufficient"), "Wallet checkout rejected when wallet balance < order total");

  const balAfterInsuff = await walletService.getWalletBalance(testUser._id);
  assert(balAfterInsuff === 500, "Wallet balance unchanged after rejected checkout");

  // 2. Fund Wallet sufficiently (e.g. add 2000 -> total 2500)
  await walletService.creditWallet({
    userId: testUser._id,
    amount: 2000,
    source: "REFUND",
    description: "Funding wallet for checkout",
    idempotencyKey: `FUND_FOR_CHECKOUT_${Date.now()}`
  });
  const balBeforePlace = await walletService.getWalletBalance(testUser._id);
  assert(balBeforePlace === 2500, "Wallet balance now 2500 (sufficient for 1500 order)");

  const stockBefore = (await Product.findById(testProduct._id)).variants.id(testVariant._id).stock;

  // 3. Successful Wallet Order Placement
  const attemptId1 = `CHK_SUCCESS_${Date.now()}`;
  const placeResult = await orderService.createWalletOrder({
    userId: testUser._id,
    addressId: testAddress._id,
    checkoutAttemptId: attemptId1
  });

  assert(placeResult.success === true, "Wallet order placed successfully");
  const createdOrder = await Order.findById(placeResult.orderId);
  assert(createdOrder.paymentMethod === "WALLET", "Order paymentMethod is WALLET");
  assert(createdOrder.paymentStatus === "COMPLETED", "Order paymentStatus is COMPLETED");
  assert(createdOrder.finalAmount === 1650, "Order finalAmount is 1650 (subtotal 1500 + shipping 150)");

  const balAfterPlace = await walletService.getWalletBalance(testUser._id);
  assert(balAfterPlace === 850, "Wallet debited exactly 1650 (balance now 850)");

  const stockAfter = (await Product.findById(testProduct._id)).variants.id(testVariant._id).stock;
  assert(stockAfter === stockBefore - 1, "Variant stock decremented atomically by 1");

  const remainingCart = await Cart.findOne({ user: testUser._id });
  assert(!remainingCart || remainingCart.items.length === 0, "Cart cleared after successful wallet order");

  // 4. Duplicate Checkout Submission (Idempotency)
  const dupPlaceResult = await orderService.createWalletOrder({
    userId: testUser._id,
    addressId: testAddress._id,
    checkoutAttemptId: attemptId1
  });
  assert(dupPlaceResult.isDuplicate === true, "Duplicate checkout attempt returns duplicate flag");
  assert(dupPlaceResult.orderId.toString() === placeResult.orderId.toString(), "Returned order matches original");

  const balAfterDup = await walletService.getWalletBalance(testUser._id);
  assert(balAfterDup === 850, "Wallet not double-debited on duplicate checkout attempt");
}

async function runAllTests() {
  try {
    await setupDatabase();
    await seedBaseData();

    await runWalletCoreTests();
    await runCancellationRefundTests();
    await runReturnRefundTests();
    await runWalletCheckoutTests();

    console.log(`\n========================================`);
    console.log(`ALL WALLET TESTS PASSED! (${passedTests}/${totalTests})`);
    console.log(`========================================\n`);
  } catch (error) {
    console.error("\nTEST SUITE FAILED with error:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

runAllTests();
