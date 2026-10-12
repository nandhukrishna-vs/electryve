import { createRequire } from "module";
const require = createRequire("c:/Users/Hp/electryve/package.json");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "c:/Users/Hp/electryve/.env" });

import User from "file:///c:/Users/Hp/electryve/src/models/User.js";
import Category from "file:///c:/Users/Hp/electryve/src/models/Category.js";
import Brand from "file:///c:/Users/Hp/electryve/src/models/Brand.js";
import Product from "file:///c:/Users/Hp/electryve/src/models/Product.js";
import Order from "file:///c:/Users/Hp/electryve/src/models/Order.js";
import Wallet from "file:///c:/Users/Hp/electryve/src/models/Wallet.js";

import * as orderService from "file:///c:/Users/Hp/electryve/src/services/orderService.js";
import * as walletService from "file:///c:/Users/Hp/electryve/src/services/walletService.js";
import * as orderController from "file:///c:/Users/Hp/electryve/src/controllers/orderController.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/electryve";

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
  console.log("STARTING TEST SUITE: ORDER ITEM CANCELLATION RULES & ISOLATION");
  console.log("============================================================");

  await mongoose.connect(MONGO_URI);

  const suffix = Date.now().toString().slice(-6);

  // Setup Users
  const userA = await User.create({
    fullName: `User A ${suffix}`,
    email: `usera_${suffix}@example.com`,
    password: "Password123!",
    phone: "9" + Math.floor(100000000 + Math.random() * 900000000).toString(),
    status: "ACTIVE"
  });

  const userB = await User.create({
    fullName: `User B ${suffix}`,
    email: `userb_${suffix}@example.com`,
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

  // Setup Products with Variants
  const productA = await Product.create({
    name: `Product A ${suffix}`,
    slug: `product-a-${suffix}`,
    description: "Description A",
    category: category._id,
    brand: brand._id,
    variants: [
      {
        ram: "8GB",
        storage: "128GB",
        color: "Black",
        sku: `SKU-A-${suffix}`,
        regularPrice: 2000,
        salePrice: 1500,
        stock: 10,
        images: ["/uploads/test-a-1.jpg", "/uploads/test-a-2.jpg", "/uploads/test-a-3.jpg"],
        isListed: true
      }
    ]
  });
  const variantAId = productA.variants[0]._id;

  const productB = await Product.create({
    name: `Product B ${suffix}`,
    slug: `product-b-${suffix}`,
    description: "Description B",
    category: category._id,
    brand: brand._id,
    variants: [
      {
        ram: "16GB",
        storage: "256GB",
        color: "Silver",
        sku: `SKU-B-${suffix}`,
        regularPrice: 3000,
        salePrice: 2500,
        stock: 10,
        images: ["/uploads/test-b-1.jpg", "/uploads/test-b-2.jpg", "/uploads/test-b-3.jpg"],
        isListed: true
      }
    ]
  });
  const variantBId = productB.variants[0]._id;

  const shippingAddress = {
    fullName: "Test Customer",
    addressLine1: "123 High Street",
    city: "Bangalore",
    state: "Karnataka",
    pinCode: "560001",
    phone: "9876543210"
  };

  const createOrderHelper = async (user, items, paymentMethod = "COD", paymentStatus = "PENDING", orderStatus = "PLACED") => {
    const subtotal = items.reduce((acc, it) => acc + it.itemTotal, 0);
    return await Order.create({
      orderNumber: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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
    // TEST 1: Cancelling a PLACED item succeeds (Controller & Service)
    // -------------------------------------------------------------
    console.log("\n--- TEST 1: Cancelling a PLACED item succeeds ---");
    const stockABefore = (await Product.findById(productA._id)).variants[0].stock;

    const order1 = await createOrderHelper(userA, [
      {
        product: productA._id,
        variantId: variantAId,
        productName: productA.name,
        brandName: brand.name,
        image: "/uploads/test-a-1.jpg",
        variantDetails: "8GB - 128GB - Black",
        regularPrice: 2000,
        salePrice: 1500,
        quantity: 2,
        itemTotal: 3000,
        itemStatus: "PLACED",
        isStockRestored: false
      }
    ], "COD", "PENDING", "PLACED");

    const item1Id = order1.items[0]._id;

    const req1 = {
      session: { user: { id: userA._id.toString() } },
      params: { id: order1._id.toString(), itemId: item1Id.toString() },
      body: { reason: "Customer changed mind" }
    };
    const res1 = mockResponse();

    await orderController.cancelOrderItem(req1, res1);

    assert(res1.statusCode === 200, "Controller returned HTTP 200 for PLACED item");
    assert(res1.jsonData?.success === true, "Controller returned success: true");
    assert(res1.jsonData?.order?.items[0].itemStatus === "CANCELLED", "Item status was updated to CANCELLED");
    assert(res1.jsonData?.order?.orderStatus === "CANCELLED", "Overall order status transitioned to CANCELLED");

    const stockAAfter = (await Product.findById(productA._id)).variants[0].stock;
    assert(stockAAfter === stockABefore + 2, `Stock restored accurately (+2): was ${stockABefore}, now ${stockAAfter}`);

    // -------------------------------------------------------------
    // TEST 2: Cancelling a SHIPPED item is rejected
    // -------------------------------------------------------------
    console.log("\n--- TEST 2: Cancelling a SHIPPED item is rejected ---");
    const order2 = await createOrderHelper(userA, [
      {
        product: productA._id,
        variantId: variantAId,
        productName: productA.name,
        brandName: brand.name,
        image: "/uploads/test-a-1.jpg",
        variantDetails: "8GB - 128GB - Black",
        regularPrice: 2000,
        salePrice: 1500,
        quantity: 1,
        itemTotal: 1500,
        itemStatus: "SHIPPED",
        isStockRestored: false
      }
    ], "COD", "PENDING", "SHIPPED");

    const req2 = {
      session: { user: { id: userA._id.toString() } },
      params: { id: order2._id.toString(), itemId: order2.items[0]._id.toString() },
      body: {}
    };
    const res2 = mockResponse();

    await orderController.cancelOrderItem(req2, res2);

    assert(res2.statusCode === 400, "Controller returned HTTP 400 for SHIPPED item");
    assert(res2.jsonData?.success === false, "Controller returned success: false");
    assert(
      res2.jsonData?.message === "This item cannot be cancelled because it has already shipped.",
      `Correct message returned: "${res2.jsonData?.message}"`
    );

    // -------------------------------------------------------------
    // TEST 3: Cancelling an OUT_FOR_DELIVERY item is rejected
    // -------------------------------------------------------------
    console.log("\n--- TEST 3: Cancelling an OUT_FOR_DELIVERY item is rejected ---");
    const order3 = await createOrderHelper(userA, [
      {
        product: productA._id,
        variantId: variantAId,
        productName: productA.name,
        brandName: brand.name,
        image: "/uploads/test-a-1.jpg",
        variantDetails: "8GB - 128GB - Black",
        regularPrice: 2000,
        salePrice: 1500,
        quantity: 1,
        itemTotal: 1500,
        itemStatus: "OUT_FOR_DELIVERY",
        isStockRestored: false
      }
    ], "COD", "PENDING", "OUT_FOR_DELIVERY");

    const req3 = {
      session: { user: { id: userA._id.toString() } },
      params: { id: order3._id.toString(), itemId: order3.items[0]._id.toString() },
      body: {}
    };
    const res3 = mockResponse();

    await orderController.cancelOrderItem(req3, res3);

    assert(res3.statusCode === 400, "Controller returned HTTP 400 for OUT_FOR_DELIVERY item");
    assert(res3.jsonData?.success === false, "Controller returned success: false");
    assert(
      res3.jsonData?.message === "This item cannot be cancelled because shipment is already in progress.",
      `Correct message returned: "${res3.jsonData?.message}"`
    );

    // -------------------------------------------------------------
    // TEST 4: Cancelling a DELIVERED item is rejected & return workflow available
    // -------------------------------------------------------------
    console.log("\n--- TEST 4: Cancelling a DELIVERED item is rejected & return workflow available ---");
    const order4 = await createOrderHelper(userA, [
      {
        product: productA._id,
        variantId: variantAId,
        productName: productA.name,
        brandName: brand.name,
        image: "/uploads/test-a-1.jpg",
        variantDetails: "8GB - 128GB - Black",
        regularPrice: 2000,
        salePrice: 1500,
        quantity: 1,
        itemTotal: 1500,
        itemStatus: "DELIVERED",
        isStockRestored: false
      }
    ], "COD", "COMPLETED", "DELIVERED");

    const req4 = {
      session: { user: { id: userA._id.toString() } },
      params: { id: order4._id.toString(), itemId: order4.items[0]._id.toString() },
      body: {}
    };
    const res4 = mockResponse();

    await orderController.cancelOrderItem(req4, res4);

    assert(res4.statusCode === 400, "Controller returned HTTP 400 for DELIVERED item");
    assert(res4.jsonData?.success === false, "Controller returned success: false");
    assert(
      res4.jsonData?.message === "This item has been delivered. Please request a return instead.",
      `Correct message returned: "${res4.jsonData?.message}"`
    );

    // Verify item return workflow remains functional
    const returnRes = await orderService.requestReturnItem(
      order4._id.toString(),
      userA._id.toString(),
      order4.items[0]._id.toString(),
      "Product defective on arrival"
    );
    assert(returnRes.success === true, "Return request succeeds on delivered item");
    assert(returnRes.order?.items[0].returnRequest.status === "PENDING", "Item returnRequest status set to PENDING");

    // -------------------------------------------------------------
    // TEST 5: Cancelling an already CANCELLED item is rejected without duplicate side effects
    // -------------------------------------------------------------
    console.log("\n--- TEST 5: Cancelling an already CANCELLED item is rejected ---");
    const stockBeforeRepeat = (await Product.findById(productA._id)).variants[0].stock;

    const req5 = {
      session: { user: { id: userA._id.toString() } },
      params: { id: order1._id.toString(), itemId: item1Id.toString() },
      body: {}
    };
    const res5 = mockResponse();

    await orderController.cancelOrderItem(req5, res5);

    assert(res5.statusCode === 400, "Repeat cancel returned HTTP 400");
    assert(res5.jsonData?.success === false, "Repeat cancel returned success: false");
    assert(
      res5.jsonData?.message === "This item has already been cancelled.",
      `Correct duplicate error message: "${res5.jsonData?.message}"`
    );

    const stockAfterRepeat = (await Product.findById(productA._id)).variants[0].stock;
    assert(stockAfterRepeat === stockBeforeRepeat, "No duplicate stock increment occurred");

    // -------------------------------------------------------------
    // TEST 6: Cancelling a RETURNED item is rejected
    // -------------------------------------------------------------
    console.log("\n--- TEST 6: Cancelling a RETURNED item is rejected ---");
    const order6 = await createOrderHelper(userA, [
      {
        product: productA._id,
        variantId: variantAId,
        productName: productA.name,
        brandName: brand.name,
        image: "/uploads/test-a-1.jpg",
        variantDetails: "8GB - 128GB - Black",
        regularPrice: 2000,
        salePrice: 1500,
        quantity: 1,
        itemTotal: 1500,
        itemStatus: "RETURNED",
        isStockRestored: true
      }
    ], "COD", "COMPLETED", "RETURNED");

    const req6 = {
      session: { user: { id: userA._id.toString() } },
      params: { id: order6._id.toString(), itemId: order6.items[0]._id.toString() },
      body: {}
    };
    const res6 = mockResponse();

    await orderController.cancelOrderItem(req6, res6);

    assert(res6.statusCode === 400, "Returned item cancel returned HTTP 400");
    assert(res6.jsonData?.success === false, "Returned item cancel returned success: false");
    assert(
      res6.jsonData?.message === "This item has already been returned.",
      `Correct returned message: "${res6.jsonData?.message}"`
    );

    // -------------------------------------------------------------
    // TEST 7: A user cannot cancel an item belonging to another user's order
    // -------------------------------------------------------------
    console.log("\n--- TEST 7: Cross-user order item cancellation rejected ---");
    const order7 = await createOrderHelper(userA, [
      {
        product: productA._id,
        variantId: variantAId,
        productName: productA.name,
        brandName: brand.name,
        image: "/uploads/test-a-1.jpg",
        variantDetails: "8GB - 128GB - Black",
        regularPrice: 2000,
        salePrice: 1500,
        quantity: 1,
        itemTotal: 1500,
        itemStatus: "PLACED",
        isStockRestored: false
      }
    ], "COD", "PENDING", "PLACED");

    const req7 = {
      session: { user: { id: userB._id.toString() } }, // User B tries to cancel User A's order
      params: { id: order7._id.toString(), itemId: order7.items[0]._id.toString() },
      body: {}
    };
    const res7 = mockResponse();

    await orderController.cancelOrderItem(req7, res7);

    assert(res7.statusCode === 404, "Cross-user cancellation returns HTTP 404");
    assert(res7.jsonData?.success === false, "Cross-user cancellation returns success: false");
    assert(res7.jsonData?.message === "Order not found.", `Message is "Order not found.": "${res7.jsonData?.message}"`);

    // Verify item remains PLACED
    const order7After = await Order.findById(order7._id);
    assert(order7After.items[0].itemStatus === "PLACED", "Item status in target order was unaffected");

    // -------------------------------------------------------------
    // TEST 8: Cancelling one item does not cancel other order items
    // -------------------------------------------------------------
    console.log("\n--- TEST 8: Cancelling one item isolates and preserves other items ---");
    const order8 = await createOrderHelper(userA, [
      {
        product: productA._id,
        variantId: variantAId,
        productName: productA.name,
        brandName: brand.name,
        image: "/uploads/test-a-1.jpg",
        variantDetails: "8GB - 128GB - Black",
        regularPrice: 2000,
        salePrice: 1500,
        quantity: 1,
        itemTotal: 1500,
        itemStatus: "PLACED",
        isStockRestored: false
      },
      {
        product: productB._id,
        variantId: variantBId,
        productName: productB.name,
        brandName: brand.name,
        image: "/uploads/test-b-1.jpg",
        variantDetails: "16GB - 256GB - Silver",
        regularPrice: 3000,
        salePrice: 2500,
        quantity: 1,
        itemTotal: 2500,
        itemStatus: "PLACED",
        isStockRestored: false
      }
    ], "COD", "PENDING", "PLACED");

    const itemA_Id = order8.items[0]._id;
    const itemB_Id = order8.items[1]._id;

    const req8 = {
      session: { user: { id: userA._id.toString() } },
      params: { id: order8._id.toString(), itemId: itemA_Id.toString() },
      body: { reason: "Cancel item A only" }
    };
    const res8 = mockResponse();

    await orderController.cancelOrderItem(req8, res8);

    assert(res8.statusCode === 200, "Item A cancelled with 200");
    const order8Updated = await Order.findById(order8._id);
    const itemAUpdated = order8Updated.items.id(itemA_Id);
    const itemBUpdated = order8Updated.items.id(itemB_Id);

    assert(itemAUpdated.itemStatus === "CANCELLED", "Item A is CANCELLED");
    assert(itemAUpdated.isStockRestored === true, "Item A stock restored flag is true");
    assert(itemBUpdated.itemStatus === "PLACED", "Item B remains PLACED");
    assert(itemBUpdated.isStockRestored === false, "Item B stock restored flag is false");
    assert(order8Updated.orderStatus === "PLACED", "Aggregate orderStatus remains PLACED while Item B is PLACED");

    // -------------------------------------------------------------
    // TEST 9: Idempotent stock restoration and wallet refunds for paid orders
    // -------------------------------------------------------------
    console.log("\n--- TEST 9: Wallet refund on paid order & idempotency ---");
    const walletBefore = await walletService.getWalletBalance(userA._id);
    const stockBBefore = (await Product.findById(productB._id)).variants[0].stock;

    const paidOrder = await createOrderHelper(userA, [
      {
        product: productB._id,
        variantId: variantBId,
        productName: productB.name,
        brandName: brand.name,
        image: "/uploads/test-b-1.jpg",
        variantDetails: "16GB - 256GB - Silver",
        regularPrice: 3000,
        salePrice: 2500,
        quantity: 1,
        itemTotal: 2500,
        itemStatus: "PLACED",
        isStockRestored: false
      }
    ], "WALLET", "COMPLETED", "PLACED");

    const cancelPaidRes = await orderService.cancelOrderItem(
      paidOrder._id.toString(),
      paidOrder.items[0]._id.toString(),
      "Paid item cancellation",
      userA._id.toString()
    );

    assert(cancelPaidRes.success === true, "Paid item cancellation succeeded");
    assert(cancelPaidRes.refund?.credited === true, "Wallet refund was credited");
    assert(cancelPaidRes.refund?.amount === 2500, `Refund amount is 2500: ${cancelPaidRes.refund?.amount}`);

    const walletAfter = await walletService.getWalletBalance(userA._id);
    assert(walletAfter === walletBefore + 2500, `Wallet balance increased by exactly 2500: was ${walletBefore}, now ${walletAfter}`);

    const stockBAfter = (await Product.findById(productB._id)).variants[0].stock;
    assert(stockBAfter === stockBBefore + 1, "Stock for Product B incremented by 1");

    // Attempt second cancellation on the paid item
    const repeatPaidRes = await orderService.cancelOrderItem(
      paidOrder._id.toString(),
      paidOrder.items[0]._id.toString(),
      "Repeat cancel attempt",
      userA._id.toString()
    );

    assert(repeatPaidRes.success === false, "Second cancellation attempt rejected");
    assert(repeatPaidRes.message === "This item has already been cancelled.", "Correct already cancelled message");

    const walletAfterRepeat = await walletService.getWalletBalance(userA._id);
    assert(walletAfterRepeat === walletAfter, "Wallet balance did not change on repeated cancel");

    const stockBAfterRepeat = (await Product.findById(productB._id)).variants[0].stock;
    assert(stockBAfterRepeat === stockBAfter, "Stock did not change on repeated cancel");

    // -------------------------------------------------------------
    // TEST 10: Aggregate order status accuracy across lifecycle transitions
    // -------------------------------------------------------------
    console.log("\n--- TEST 10: Aggregate order status accuracy ---");
    // Scenario 10A: Order with 2 items (1 SHIPPED, 1 PLACED). Overall: PARTIALLY_SHIPPED
    // User cancels the PLACED item. Overall becomes SHIPPED.
    const mixedOrder = await createOrderHelper(userA, [
      {
        product: productA._id,
        variantId: variantAId,
        productName: productA.name,
        brandName: brand.name,
        image: "/uploads/test-a-1.jpg",
        variantDetails: "8GB - 128GB - Black",
        regularPrice: 2000,
        salePrice: 1500,
        quantity: 1,
        itemTotal: 1500,
        itemStatus: "SHIPPED",
        isStockRestored: false
      },
      {
        product: productB._id,
        variantId: variantBId,
        productName: productB.name,
        brandName: brand.name,
        image: "/uploads/test-b-1.jpg",
        variantDetails: "16GB - 256GB - Silver",
        regularPrice: 3000,
        salePrice: 2500,
        quantity: 1,
        itemTotal: 2500,
        itemStatus: "PLACED",
        isStockRestored: false
      }
    ], "COD", "PENDING", "PARTIALLY_SHIPPED");

    const placedItemInMixed = mixedOrder.items[1]._id;
    const cancelMixedRes = await orderService.cancelOrderItem(
      mixedOrder._id.toString(),
      placedItemInMixed.toString(),
      "Cancelling PLACED item in partially shipped order",
      userA._id.toString()
    );

    assert(cancelMixedRes.success === true, "PLACED item in PARTIALLY_SHIPPED order cancelled successfully");
    const mixedOrderUpdated = await Order.findById(mixedOrder._id);
    assert(
      mixedOrderUpdated.orderStatus === "SHIPPED",
      `Order status transitioned to SHIPPED: "${mixedOrderUpdated.orderStatus}"`
    );
    assert(mixedOrderUpdated.items[0].itemStatus === "SHIPPED", "First item remains SHIPPED");
    assert(mixedOrderUpdated.items[1].itemStatus === "CANCELLED", "Second item is CANCELLED");

    // -------------------------------------------------------------
    // TEST 11: Frontend error response format & invalid input handling
    // -------------------------------------------------------------
    console.log("\n--- TEST 11: Frontend response format and invalid input handling ---");
    const reqInvalid = {
      session: { user: { id: userA._id.toString() } },
      params: { id: "invalid-id", itemId: "invalid-item" },
      body: {}
    };
    const resInvalid = mockResponse();

    await orderController.cancelOrderItem(reqInvalid, resInvalid);
    assert(resInvalid.statusCode === 400, "Invalid ID returns 400");
    assert(resInvalid.jsonData?.success === false, "Invalid ID returns success: false");
    assert(resInvalid.jsonData?.message === "Invalid order or item ID.", "Clear invalid ID message");

    const reqUnauth = {
      session: null,
      params: { id: order1._id.toString(), itemId: item1Id.toString() },
      body: {}
    };
    const resUnauth = mockResponse();

    await orderController.cancelOrderItem(reqUnauth, resUnauth);
    assert(resUnauth.statusCode === 401, "Unauthenticated returns 401");

    // -------------------------------------------------------------
    // TEST 12: Existing whole-order cancellation and return flows remain intact
    // -------------------------------------------------------------
    console.log("\n--- TEST 12: Whole-order cancellation and return flows remain intact ---");
    const stockABeforeWhole = (await Product.findById(productA._id)).variants[0].stock;

    const wholeOrder = await createOrderHelper(userA, [
      {
        product: productA._id,
        variantId: variantAId,
        productName: productA.name,
        brandName: brand.name,
        image: "/uploads/test-a-1.jpg",
        variantDetails: "8GB - 128GB - Black",
        regularPrice: 2000,
        salePrice: 1500,
        quantity: 1,
        itemTotal: 1500,
        itemStatus: "PLACED",
        isStockRestored: false
      }
    ], "COD", "PENDING", "PLACED");

    const wholeCancelRes = await orderService.cancelOrder(wholeOrder._id.toString(), "Whole order cancellation");
    assert(wholeCancelRes.success === true, "Whole order cancelOrder succeeded");
    assert(wholeCancelRes.order?.orderStatus === "CANCELLED", "Whole order status is CANCELLED");
    assert(wholeCancelRes.order?.items[0].itemStatus === "CANCELLED", "Item in whole order is CANCELLED");

    const stockAAfterWhole = (await Product.findById(productA._id)).variants[0].stock;
    assert(stockAAfterWhole === stockABeforeWhole + 1, "Stock restored by whole order cancellation");

    // -------------------------------------------------------------
    // BONUS: Legacy ACTIVE item status compatibility
    // -------------------------------------------------------------
    console.log("\n--- BONUS: Legacy ACTIVE item status compatibility ---");
    const legacyOrder = await createOrderHelper(userA, [
      {
        product: productA._id,
        variantId: variantAId,
        productName: productA.name,
        brandName: brand.name,
        image: "/uploads/test-a-1.jpg",
        variantDetails: "8GB - 128GB - Black",
        regularPrice: 2000,
        salePrice: 1500,
        quantity: 1,
        itemTotal: 1500,
        itemStatus: "ACTIVE",
        isStockRestored: false
      }
    ], "COD", "PENDING", "PLACED");

    const reqLegacy = {
      session: { user: { id: userA._id.toString() } },
      params: { id: legacyOrder._id.toString(), itemId: legacyOrder.items[0]._id.toString() },
      body: { reason: "Cancelling legacy ACTIVE item" }
    };
    const resLegacy = mockResponse();

    await orderController.cancelOrderItem(reqLegacy, resLegacy);
    assert(resLegacy.statusCode === 200, "Legacy ACTIVE item in PLACED order cancelled successfully");
    assert(resLegacy.jsonData?.order?.items[0].itemStatus === "CANCELLED", "Legacy item status set to CANCELLED");

  } finally {
    // Cleanup fixtures
    await Order.deleteMany({ _id: { $exists: true }, "shippingAddress.fullName": "Test Customer" });
    await Product.deleteMany({ _id: { $in: [productA._id, productB._id] } });
    await Category.deleteOne({ _id: category._id });
    await Brand.deleteOne({ _id: brand._id });
    await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
    await Wallet.deleteMany({ user: { $in: [userA._id, userB._id] } });
    await mongoose.disconnect();
  }

  console.log("\n============================================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
