import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: "c:/Users/Hp/electryve/.env" });

import User from "../src/models/User.js";
import Category from "../src/models/Category.js";
import Brand from "../src/models/Brand.js";
import Product from "../src/models/Product.js";
import Order from "../src/models/Order.js";
import Wallet from "../src/models/Wallet.js";

import * as orderService from "../src/services/orderService.js";
import * as walletService from "../src/services/walletService.js";
import * as orderController from "../src/controllers/orderController.js";
import * as adminOrderController from "../src/controllers/adminOrderController.js";
import * as cartController from "../src/controllers/cartController.js";
import * as paymentController from "../src/controllers/paymentController.js";

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/electryve";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${message}`);
  }
}

function mockResponse() {
  return {
    statusCode: 200,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    }
  };
}

async function runTests() {
  console.log("============================================================");
  console.log("STARTING TEST SUITE: USER & ADMIN MESSAGE AUDIT");
  console.log("============================================================");

  await mongoose.connect(MONGO_URI);

  const suffix = Date.now().toString().slice(-6);

  // Setup User
  const user = await User.create({
    fullName: `Audit User ${suffix}`,
    email: `audit_${suffix}@example.com`,
    password: "Password123!",
    phone: "9" + Math.floor(100000000 + Math.random() * 900000000).toString(),
    status: "ACTIVE"
  });

  // Setup Category & Brand
  const category = await Category.create({
    name: `Category ${suffix}`,
    slug: `category-${suffix}`,
    isActive: true
  });

  const brand = await Brand.create({
    name: `Brand ${suffix}`,
    slug: `brand-${suffix}`,
    isActive: true
  });

  // Setup Product with Variant
  const product = await Product.create({
    name: `Product ${suffix}`,
    slug: `product-${suffix}`,
    description: "Audit Description",
    category: category._id,
    brand: brand._id,
    variants: [
      {
        ram: "8GB",
        storage: "128GB",
        color: "Phantom Black",
        sku: `SKU-AUDIT-${suffix}`,
        regularPrice: 30000,
        salePrice: 28999,
        stock: 10,
        images: ["/uploads/test-1.jpg", "/uploads/test-2.jpg", "/uploads/test-3.jpg"],
        isListed: true
      }
    ]
  });
  const variantId = product.variants[0]._id;

  const shippingAddress = {
    fullName: "Audit Customer",
    addressLine1: "456 Tech Park",
    city: "Bangalore",
    state: "Karnataka",
    pinCode: "560001",
    phone: "9876543210"
  };

  const createOrderHelper = async (items, paymentMethod = "COD", paymentStatus = "PENDING", orderStatus = "PLACED") => {
    const subtotal = items.reduce((acc, it) => acc + it.itemTotal, 0);
    return await Order.create({
      orderNumber: `ORD-AUDIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      user: user._id,
      items,
      shippingAddress,
      subtotal,
      totalAmount: subtotal,
      finalAmount: subtotal,
      paymentMethod,
      paymentStatus,
      orderStatus
    });
  };

  try {
    // -------------------------------------------------------------
    // TEST 1: User Item Cancellation — Paid Order (Customer vs Admin Messages)
    // -------------------------------------------------------------
    console.log("\n--- TEST 1: User Item Cancellation (Paid Order) ---");
    const orderPaid = await createOrderHelper([
      {
        product: product._id,
        variantId,
        productName: product.name,
        brandName: brand.name,
        image: "/uploads/test-1.jpg",
        variantDetails: "8GB - 128GB - Phantom Black",
        regularPrice: 30000,
        salePrice: 28999,
        quantity: 1,
        itemTotal: 28999,
        itemStatus: "PLACED",
        isStockRestored: false
      }
    ], "RAZORPAY", "COMPLETED", "PLACED");

    const reqPaid = {
      session: { user: { id: user._id.toString() } },
      params: { id: orderPaid._id.toString(), itemId: orderPaid.items[0]._id.toString() },
      body: { reason: "Found better price" }
    };
    const resPaid = mockResponse();

    await orderController.cancelOrderItem(reqPaid, resPaid);

    assert(resPaid.statusCode === 200, "User controller returned HTTP 200");
    const userMsg = resPaid.jsonData?.message;
    console.log(`    User Message: "${userMsg}"`);
    assert(!userMsg.toLowerCase().includes("stock"), "User message does NOT contain 'stock'");
    assert(!userMsg.toLowerCase().includes("inventory"), "User message does NOT contain 'inventory'");
    assert(!userMsg.toLowerCase().includes("restored"), "User message does NOT contain 'restored'");
    assert(userMsg.includes("28,999"), "User message contains accurate verified refund amount (₹28,999)");
    assert(userMsg.toLowerCase().includes("wallet"), "User message mentions wallet credit destination");

    // -------------------------------------------------------------
    // TEST 2: User Item Cancellation — Unpaid COD Order (No false refund claims)
    // -------------------------------------------------------------
    console.log("\n--- TEST 2: User Item Cancellation (Unpaid COD Order) ---");
    const orderCod = await createOrderHelper([
      {
        product: product._id,
        variantId,
        productName: product.name,
        brandName: brand.name,
        image: "/uploads/test-1.jpg",
        variantDetails: "8GB - 128GB - Phantom Black",
        regularPrice: 30000,
        salePrice: 28999,
        quantity: 1,
        itemTotal: 28999,
        itemStatus: "PLACED",
        isStockRestored: false
      }
    ], "COD", "PENDING", "PLACED");

    const reqCod = {
      session: { user: { id: user._id.toString() } },
      params: { id: orderCod._id.toString(), itemId: orderCod.items[0]._id.toString() },
      body: { reason: "Changed mind" }
    };
    const resCod = mockResponse();

    await orderController.cancelOrderItem(reqCod, resCod);

    assert(resCod.statusCode === 200, "COD item cancelled successfully");
    const codUserMsg = resCod.jsonData?.message;
    console.log(`    COD User Message: "${codUserMsg}"`);
    assert(codUserMsg === "Your item has been cancelled successfully.", "Clean customer confirmation without false refund claims");
    assert(!codUserMsg.toLowerCase().includes("refund"), "COD cancellation does not claim a refund");
    assert(!codUserMsg.toLowerCase().includes("stock"), "COD cancellation does not mention stock");

    // -------------------------------------------------------------
    // TEST 3: Admin Item Cancellation — Operational Diagnostics
    // -------------------------------------------------------------
    console.log("\n--- TEST 3: Admin Item Cancellation (Operational Diagnostics) ---");
    const orderAdminPaid = await createOrderHelper([
      {
        product: product._id,
        variantId,
        productName: product.name,
        brandName: brand.name,
        image: "/uploads/test-1.jpg",
        variantDetails: "8GB - 128GB - Phantom Black",
        regularPrice: 30000,
        salePrice: 28999,
        quantity: 1,
        itemTotal: 28999,
        itemStatus: "PLACED",
        isStockRestored: false
      }
    ], "WALLET", "COMPLETED", "PLACED");

    const reqAdmin = {
      params: { id: orderAdminPaid._id.toString(), itemId: orderAdminPaid.items[0]._id.toString() },
      body: { reason: "Admin cancelled" }
    };
    const resAdmin = mockResponse();

    await adminOrderController.cancelOrderItem(reqAdmin, resAdmin);

    assert(resAdmin.statusCode === 200, "Admin controller returned HTTP 200");
    const adminMsg = resAdmin.jsonData?.message;
    console.log(`    Admin Message: "${adminMsg}"`);
    assert(adminMsg.toLowerCase().includes("inventory restored"), "Admin message explicitly confirms inventory restored");
    assert(adminMsg.toLowerCase().includes("wallet refund"), "Admin message confirms wallet refund");
    assert(adminMsg.includes("28,999"), "Admin message states refund amount");

    // -------------------------------------------------------------
    // TEST 4: Whole-Order Cancellation (Customer vs Admin Messages)
    // -------------------------------------------------------------
    console.log("\n--- TEST 4: Whole-Order Cancellation Messages ---");
    const orderWholePaid = await createOrderHelper([
      {
        product: product._id,
        variantId,
        productName: product.name,
        brandName: brand.name,
        image: "/uploads/test-1.jpg",
        variantDetails: "8GB - 128GB - Phantom Black",
        regularPrice: 30000,
        salePrice: 28999,
        quantity: 1,
        itemTotal: 28999,
        itemStatus: "PLACED",
        isStockRestored: false
      }
    ], "RAZORPAY", "COMPLETED", "PLACED");

    const reqWholeUser = {
      session: { user: { id: user._id.toString() } },
      params: { id: orderWholePaid._id.toString() },
      body: { reason: "Whole order cancel" }
    };
    const resWholeUser = mockResponse();

    await orderController.cancelOrder(reqWholeUser, resWholeUser);

    assert(resWholeUser.statusCode === 200, "User whole-order cancel returned HTTP 200");
    const wholeUserMsg = resWholeUser.jsonData?.message;
    console.log(`    Whole Order User Message: "${wholeUserMsg}"`);
    assert(!wholeUserMsg.toLowerCase().includes("stock"), "Whole order user message does NOT contain 'stock'");
    assert(wholeUserMsg.includes("28,999"), "Whole order user message confirms refund amount");

    // -------------------------------------------------------------
    // TEST 5: Whole-Order Status Rejection (No raw PLACED enum leaks)
    // -------------------------------------------------------------
    console.log("\n--- TEST 5: Whole-Order Status Rejection Messages ---");
    const orderShipped = await createOrderHelper([
      {
        product: product._id,
        variantId,
        productName: product.name,
        brandName: brand.name,
        image: "/uploads/test-1.jpg",
        variantDetails: "8GB - 128GB - Phantom Black",
        regularPrice: 30000,
        salePrice: 28999,
        quantity: 1,
        itemTotal: 28999,
        itemStatus: "SHIPPED",
        isStockRestored: false
      }
    ], "COD", "PENDING", "SHIPPED");

    const reqShipped = {
      session: { user: { id: user._id.toString() } },
      params: { id: orderShipped._id.toString() },
      body: {}
    };
    const resShipped = mockResponse();

    await orderController.cancelOrder(reqShipped, resShipped);

    assert(resShipped.statusCode === 400, "Shipped order cancel rejected with 400");
    const shippedMsg = resShipped.jsonData?.message;
    console.log(`    Shipped Rejection Message: "${shippedMsg}"`);
    assert(shippedMsg === "This order cannot be cancelled because it has already shipped.", "Clean shipped order cancellation message");
    assert(!shippedMsg.includes("PLACED"), "Does not expose internal enum 'PLACED'");

    // -------------------------------------------------------------
    // TEST 6: Returns Validation Messages
    // -------------------------------------------------------------
    console.log("\n--- TEST 6: Returns Validation Messages ---");
    const returnOnPlacedOrder = await orderService.requestReturn(
      orderCod._id.toString(),
      user._id.toString(),
      "Defective screen"
    );
    assert(returnOnPlacedOrder.success === false, "Return request on non-delivered order fails");
    console.log(`    Return Rejection: "${returnOnPlacedOrder.message}"`);
    assert(
      returnOnPlacedOrder.message === "Returns can only be requested for orders that have been delivered.",
      "Clean customer message: Returns can only be requested for orders that have been delivered."
    );

    // -------------------------------------------------------------
    // TEST 7: Return Approval Messages (Customer vs Admin)
    // -------------------------------------------------------------
    console.log("\n--- TEST 7: Return Approval Messages ---");
    const orderToReturn = await createOrderHelper([
      {
        product: product._id,
        variantId,
        productName: product.name,
        brandName: brand.name,
        image: "/uploads/test-1.jpg",
        variantDetails: "8GB - 128GB - Phantom Black",
        regularPrice: 30000,
        salePrice: 28999,
        quantity: 1,
        itemTotal: 28999,
        itemStatus: "DELIVERED",
        isStockRestored: false
      }
    ], "RAZORPAY", "COMPLETED", "DELIVERED");

    await orderService.requestReturn(orderToReturn._id.toString(), user._id.toString(), "Defective unit");

    const reqApprove = {
      params: { id: orderToReturn._id.toString() }
    };
    const resApprove = mockResponse();

    await adminOrderController.approveReturnRequest(reqApprove, resApprove);

    assert(resApprove.statusCode === 200, "Admin approve return returned 200");
    const approveAdminMsg = resApprove.jsonData?.message;
    console.log(`    Admin Approve Message: "${approveAdminMsg}"`);
    assert(approveAdminMsg.toLowerCase().includes("inventory restored"), "Admin approve confirms inventory restored");
    assert(approveAdminMsg.includes("28,999"), "Admin approve confirms refund amount");

    // -------------------------------------------------------------
    // TEST 8: Cart Controller Error Messages
    // -------------------------------------------------------------
    console.log("\n--- TEST 8: Cart Controller Error Messages ---");
    // 8A. Business Validation Message (400)
    const reqCartVal = {
      session: { user: { id: user._id.toString() } },
      body: {}
    };
    const resCartVal = mockResponse();
    await cartController.addToCart(reqCartVal, resCartVal);
    assert(resCartVal.statusCode === 400, "Missing IDs returns 400");
    console.log(`    Cart Validation Message: "${resCartVal.jsonData?.message}"`);
    assert(resCartVal.jsonData?.message === "Invalid product or variant ID format.", "Clear validation message");

    // 8B. Unexpected Error Catch Block (500)
    const reqCartError = {
      session: { user: { id: user._id.toString() } },
      body: null // Triggers destructuring TypeError in controller
    };
    const resCartError = mockResponse();
    await cartController.addToCart(reqCartError, resCartError);
    assert(resCartError.statusCode === 500, "Unexpected error triggers 500 catch block");
    console.log(`    Cart 500 Error Message: "${resCartError.jsonData?.message}"`);
    assert(resCartError.jsonData?.message === "Unable to add item to cart. Please try again.", "Customer-friendly 500 cart add error message");

    // -------------------------------------------------------------
    // TEST 9: Payment Signature Error Message
    // -------------------------------------------------------------
    console.log("\n--- TEST 9: Payment Signature Error Message ---");
    const reqPaySig = {
      session: { user: { id: user._id.toString() } },
      body: {
        razorpay_order_id: "order_123",
        razorpay_payment_id: "pay_123",
        razorpay_signature: "invalid_sig"
      }
    };
    const resPaySig = mockResponse();
    await paymentController.verifyPayment(reqPaySig, resPaySig);
    assert(resPaySig.statusCode === 400, "Invalid signature returns 400");
    console.log(`    Payment Signature Error: "${resPaySig.jsonData?.message}"`);
    assert(resPaySig.jsonData?.message === "Payment verification failed. Please try again or contact customer support.", "Clean payment verification error without HMAC cryptographic leak");

  } finally {
    // Cleanup fixtures
    await Order.deleteMany({ _id: { $exists: true }, "shippingAddress.fullName": "Audit Customer" });
    await Product.deleteOne({ _id: product._id });
    await Category.deleteOne({ _id: category._id });
    await Brand.deleteOne({ _id: brand._id });
    await User.deleteOne({ _id: user._id });
    await Wallet.deleteOne({ userId: user._id });
    await mongoose.disconnect();
  }

  console.log("\n============================================================");
  console.log(`AUDIT TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
