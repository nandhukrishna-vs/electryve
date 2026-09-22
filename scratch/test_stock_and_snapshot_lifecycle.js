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
import Cart from "file:///c:/Users/Hp/electryve/src/models/Cart.js";
import Address from "file:///c:/Users/Hp/electryve/src/models/Address.js";
import Coupon from "file:///c:/Users/Hp/electryve/src/models/Coupon.js";

import * as cartService from "file:///c:/Users/Hp/electryve/src/services/cartService.js";
import * as orderService from "file:///c:/Users/Hp/electryve/src/services/orderService.js";
import * as orderController from "file:///c:/Users/Hp/electryve/src/controllers/orderController.js";
import * as adminOrderController from "file:///c:/Users/Hp/electryve/src/controllers/adminOrderController.js";

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

async function runTests() {
  console.log("============================================================");
  console.log("STARTING FULL STOCK LIFECYCLE & ORDER SNAPSHOT AUDIT SUITE");
  console.log("============================================================");

  await mongoose.connect(MONGO_URI);

  const testSuffix = Date.now().toString().slice(-6);

  // 1. Setup Test Fixtures
  const phone1 = "9" + Math.floor(100000000 + Math.random() * 900000000).toString();
  const phone2 = "9" + Math.floor(100000000 + Math.random() * 900000000).toString();

  const testUser = await User.create({
    fullName: `Test User ${testSuffix}`,
    email: `testuser_${testSuffix}@example.com`,
    password: "Password123!",
    phone: phone1,
    isBlocked: false
  });

  const testUser2 = await User.create({
    fullName: `Test User2 ${testSuffix}`,
    email: `testuser2_${testSuffix}@example.com`,
    password: "Password123!",
    phone: phone2,
    isBlocked: false
  });

  const testCategory = await Category.create({
    name: `Test Cat ${testSuffix}`,
    slug: `test-cat-${testSuffix}`,
    description: "Category for test",
    isListed: true,
    isDeleted: false
  });

  const testBrand = await Brand.create({
    name: `Test Brand ${testSuffix}`,
    slug: `test-brand-${testSuffix}`,
    description: "Brand for test",
    isListed: true,
    isDeleted: false
  });

  const testAddress = await Address.create({
    userId: testUser._id,
    fullName: "Test Customer",
    phone: "9876543210",
    addressLine1: "123 Test Street",
    addressLine2: "Suite 4",
    landmark: "Test Park",
    city: "TestCity",
    state: "TestState",
    pinCode: 682001,
    addressType: "HOME",
    isDefault: true
  });

  const testAddress2 = await Address.create({
    userId: testUser2._id,
    fullName: "Test Customer 2",
    phone: "9876543211",
    addressLine1: "456 Test Ave",
    city: "TestCity2",
    state: "TestState2",
    pinCode: 682002,
    addressType: "OFFICE",
    isDefault: true
  });

  // Product A: 2 variants (Variant 1 stock: 10, Variant 2 stock: 5)
  const productA = await Product.create({
    name: `Product A ${testSuffix}`,
    slug: `product-a-${testSuffix}`,
    description: "Product A Description",
    category: testCategory._id,
    brand: testBrand._id,
    isListed: true,
    isDeleted: false,
    variants: [
      {
        color: "Black",
        storage: "128GB",
        sku: `SKU-A1-${testSuffix}`,
        regularPrice: 10000,
        salePrice: 9000,
        stock: 10,
        images: ["/uploads/test-a1-1.jpg", "/uploads/test-a1-2.jpg", "/uploads/test-a1-3.jpg"],
        isListed: true
      },
      {
        color: "Silver",
        storage: "256GB",
        sku: `SKU-A2-${testSuffix}`,
        regularPrice: 15000,
        salePrice: 13500,
        stock: 5,
        images: ["/uploads/test-a2-1.jpg", "/uploads/test-a2-2.jpg", "/uploads/test-a2-3.jpg"],
        isListed: true
      }
    ]
  });

  // Product B: 1 variant (stock: 1 for concurrency test)
  const productB = await Product.create({
    name: `Product B ${testSuffix}`,
    slug: `product-b-${testSuffix}`,
    description: "Product B Description",
    category: testCategory._id,
    brand: testBrand._id,
    isListed: true,
    isDeleted: false,
    variants: [
      {
        color: "Gold",
        storage: "64GB",
        sku: `SKU-B1-${testSuffix}`,
        regularPrice: 8000,
        salePrice: 7000,
        stock: 1,
        images: ["/uploads/test-b1-1.jpg", "/uploads/test-b1-2.jpg", "/uploads/test-b1-3.jpg"],
        isListed: true
      }
    ]
  });

  const varA1Id = productA.variants[0]._id;
  const varA2Id = productA.variants[1]._id;
  const varB1Id = productB.variants[0]._id;

  console.log("\n--- SECTION 1: Cart Operations Stock Integrity (Part 34: 1-7) ---");

  // 1. Add one item to cart -> stock unchanged
  const add1 = await cartService.addToCart(testUser._id, productA._id, varA1Id, 2);
  assert(add1.success, "Add 2 qty to cart succeeds");
  const checkStock1 = await Product.findById(productA._id);
  assert(checkStock1.variants.id(varA1Id).stock === 10, "Stock unchanged after adding to cart (still 10)");

  // 2. Add same item twice -> stock unchanged
  const add2 = await cartService.addToCart(testUser._id, productA._id, varA1Id, 1);
  assert(add2.success, "Adding same item adds to quantity");
  const checkStock2 = await Product.findById(productA._id);
  assert(checkStock2.variants.id(varA1Id).stock === 10, "Stock unchanged after adding same item twice (still 10)");
  const cart1 = await Cart.findOne({ user: testUser._id });
  assert(cart1.items[0].quantity === 3, "Cart quantity updated to 3");

  // 3. Increase cart quantity -> stock unchanged
  const upd1 = await cartService.updateQuantity(testUser._id, productA._id, varA1Id, 4);
  assert(upd1.success, "Update cart quantity to 4 succeeds");
  const checkStock3 = await Product.findById(productA._id);
  assert(checkStock3.variants.id(varA1Id).stock === 10, "Stock unchanged after cart quantity increase (still 10)");

  // 4. Decrease cart quantity -> stock unchanged
  const upd2 = await cartService.updateQuantity(testUser._id, productA._id, varA1Id, 2);
  assert(upd2.success, "Decrease cart quantity to 2 succeeds");
  const checkStock4 = await Product.findById(productA._id);
  assert(checkStock4.variants.id(varA1Id).stock === 10, "Stock unchanged after cart quantity decrease (still 10)");

  // 5. Remove cart item -> stock unchanged
  const rem1 = await cartService.removeItem(testUser._id, productA._id, varA1Id);
  assert(rem1.success, "Remove cart item succeeds");
  const checkStock5 = await Product.findById(productA._id);
  assert(checkStock5.variants.id(varA1Id).stock === 10, "Stock unchanged after removing cart item (still 10)");
  const cartEmpty = await Cart.findOne({ user: testUser._id });
  assert(cartEmpty.items.length === 0, "Cart is now empty");

  // 6. Non-integer / float / zero quantity rejected
  const floatAdd = await cartService.addToCart(testUser._id, productA._id, varA1Id, 1.5);
  assert(!floatAdd.success, "Float quantity 1.5 rejected by addToCart");
  const zeroAdd = await cartService.addToCart(testUser._id, productA._id, varA1Id, 0);
  assert(!zeroAdd.success, "Zero quantity rejected by addToCart");
  const negAdd = await cartService.addToCart(testUser._id, productA._id, varA1Id, -2);
  assert(!negAdd.success, "Negative quantity rejected by addToCart");

  // 7. Add quantity equal to available stock; try adding beyond available stock
  const addMax = await cartService.addToCart(testUser._id, productA._id, varA1Id, 5); // MAX_CART_QUANTITY is 5
  assert(addMax.success, "Adding max cart quantity (5) succeeds");
  const addBeyond = await cartService.addToCart(testUser._id, productA._id, varA1Id, 1);
  assert(!addBeyond.success, "Adding beyond max/available rejected");
  await cartService.removeItem(testUser._id, productA._id, varA1Id);

  console.log("\n--- SECTION 2: Checkout Validation & Unlisted Entities (Part 34: 8-13) ---");

  // Add 1 item of A1
  await cartService.addToCart(testUser._id, productA._id, varA1Id, 1);

  // 8. Admin unlists product -> blocks checkout
  await Product.updateOne({ _id: productA._id }, { $set: { isListed: false } });
  const cartUnlistedProd = await cartService.getCart(testUser._id);
  assert(!cartUnlistedProd.canCheckout, "Checkout blocked when product is unlisted");
  const attemptOrder1 = await orderService.createCODOrder(testUser._id, testAddress._id);
  assert(!attemptOrder1.success, "Order creation fails when product is unlisted");
  await Product.updateOne({ _id: productA._id }, { $set: { isListed: true } });

  // 9. Admin unlists category -> blocks checkout
  await Category.updateOne({ _id: testCategory._id }, { $set: { isListed: false } });
  const cartUnlistedCat = await cartService.getCart(testUser._id);
  assert(!cartUnlistedCat.canCheckout, "Checkout blocked when category is unlisted");
  await Category.updateOne({ _id: testCategory._id }, { $set: { isListed: true } });

  // 10. Admin disables brand -> blocks checkout
  await Brand.updateOne({ _id: testBrand._id }, { $set: { isListed: false } });
  const cartUnlistedBrand = await cartService.getCart(testUser._id);
  assert(!cartUnlistedBrand.canCheckout, "Checkout blocked when brand is unlisted");
  await Brand.updateOne({ _id: testBrand._id }, { $set: { isListed: true } });

  // 11. Variant stock becomes 0 -> blocks checkout
  await Product.updateOne({ _id: productA._id, "variants._id": varA1Id }, { $set: { "variants.$.stock": 0 } });
  const cartZeroStock = await cartService.getCart(testUser._id);
  assert(!cartZeroStock.canCheckout, "Checkout blocked when variant stock becomes 0");
  const attemptOrderZero = await orderService.createCODOrder(testUser._id, testAddress._id);
  assert(!attemptOrderZero.success, "createCODOrder rejected when variant stock is 0");
  await Product.updateOne({ _id: productA._id, "variants._id": varA1Id }, { $set: { "variants.$.stock": 10 } });

  console.log("\n--- SECTION 3: Successful Order Placement & Authoritative Stock Decrement (Part 34: 14-17) ---");

  // Setup cart with Variant A1 (qty 2) and Variant A2 (qty 1)
  await Cart.updateOne({ user: testUser._id }, { $set: { items: [] } });
  await cartService.addToCart(testUser._id, productA._id, varA1Id, 2);
  await cartService.addToCart(testUser._id, productA._id, varA2Id, 1);

  const attemptId1 = "attempt-uuid-001";
  const orderRes1 = await orderService.createCODOrder(testUser._id, testAddress._id, null, attemptId1);
  assert(orderRes1.success, "Multi-item COD order placed successfully");

  // Verify stock decremented accurately
  const checkStockAfterOrder1 = await Product.findById(productA._id);
  const stockA1 = checkStockAfterOrder1.variants.id(varA1Id).stock;
  const stockA2 = checkStockAfterOrder1.variants.id(varA2Id).stock;
  assert(stockA1 === 8, `Variant A1 stock decremented by 2 (10 -> ${stockA1})`);
  assert(stockA2 === 4, `Variant A2 stock decremented by 1 (5 -> ${stockA2})`);

  // Verify cart cleared
  const cartAfterOrder1 = await Cart.findOne({ user: testUser._id });
  assert(cartAfterOrder1.items.length === 0, "Cart cleared after order creation");

  // Verify snapshot details on order document
  const order1 = await Order.findById(orderRes1.orderId);
  assert(order1.orderStatus === "PLACED", "Order status is PLACED");
  assert(order1.idempotencyKey === attemptId1, "idempotencyKey preserved on order");
  assert(order1.items.length === 2, "Order has 2 items");
  assert(order1.items[0].sku === `SKU-A1-${testSuffix}`, `Item 0 SKU snapshotted: ${order1.items[0].sku}`);
  assert(order1.items[0].regularPrice === 10000, "Item 0 regularPrice snapshotted: 10000");
  assert(order1.items[0].salePrice === 9000, "Item 0 salePrice snapshotted: 9000");
  assert(order1.items[0].offerDiscount === 0, "Item 0 offerDiscount default: 0");
  assert(order1.items[0].itemTotal === 18000, "Item 0 itemTotal: 18000");
  assert(order1.subtotal === 31500, `Order subtotal matches (18000 + 13500 = ${order1.subtotal})`);
  assert(order1.finalAmount === 31500, `Order finalAmount matches subtotal: ${order1.finalAmount}`);

  console.log("\n--- SECTION 4: Database-Backed Idempotency & Retry Protection (Part 34: 20 & Mandatory 2) ---");

  // Retry with same attempt ID on empty cart
  const retryRes1 = await orderService.createCODOrder(testUser._id, testAddress._id, null, attemptId1);
  assert(retryRes1.success, "Retry with same idempotencyKey returns success");
  assert(retryRes1.isDuplicate, "isDuplicate flag set on retry");
  assert(retryRes1.orderNumber === order1.orderNumber, "Retry returns same order number");

  // Confirm stock was NOT decremented again
  const checkStockRetry = await Product.findById(productA._id);
  assert(checkStockRetry.variants.id(varA1Id).stock === 8, "Stock unchanged after retry (still 8)");
  assert(checkStockRetry.variants.id(varA2Id).stock === 4, "Stock unchanged after retry (still 4)");

  console.log("\n--- SECTION 5: Multi-Item Stock Failure & Compensation Rollback (Part 34: 18-19 & Mandatory 1) ---");

  // Prepare cart: Item 1 has 2 units, Item 2 has 1 unit
  await Cart.updateOne(
    { user: testUser._id },
    {
      $set: {
        items: [
          { product: productA._id, variantId: varA1Id, quantity: 2, priceSnapshot: 9000, nameSnapshot: "A1", variantSnapshot: "Black / 128GB", imageSnapshot: "/img.jpg" },
          { product: productA._id, variantId: varA2Id, quantity: 1, priceSnapshot: 13500, nameSnapshot: "A2", variantSnapshot: "Silver / 256GB", imageSnapshot: "/img.jpg" }
        ]
      }
    }
  );

  // Intercept Product.updateOne so Item 1 succeeds (8 -> 6) and Item 2 fails
  const originalUpdateOne = Product.updateOne;
  let deductCallCount = 0;
  Product.updateOne = async function (filter, update, opts) {
    if (update && update.$inc && update.$inc["variants.$.stock"] < 0) {
      deductCallCount++;
      if (deductCallCount === 2) {
        // Simulate race condition where item 2 stock became insufficient at the moment of deduction
        return { modifiedCount: 0, matchedCount: 0, acknowledged: true };
      }
    }
    return originalUpdateOne.apply(this, arguments);
  };

  const attemptFailId = "attempt-fail-001";
  const failOrderRes = await orderService.createCODOrder(testUser._id, testAddress._id, null, attemptFailId);
  Product.updateOne = originalUpdateOne;

  assert(!failOrderRes.success, "Order creation rejected due to insufficient stock on second item");
  assert(failOrderRes.message.includes("Insufficient stock"), `Error message indicates insufficient stock: ${failOrderRes.message}`);

  // Verify item 1 was ROLLED BACK safely to 8 in real database
  const checkStockAfterRollback = await Product.findById(productA._id);
  assert(checkStockAfterRollback.variants.id(varA1Id).stock === 8, `Item 1 stock rolled back safely (expected 8, got ${checkStockAfterRollback.variants.id(varA1Id).stock})`);
  assert(checkStockAfterRollback.variants.id(varA2Id).stock === 4, `Item 2 stock was never decremented (expected 4, got ${checkStockAfterRollback.variants.id(varA2Id).stock})`);

  // Verify order was not created
  const failOrder = await Order.findOne({ idempotencyKey: attemptFailId });
  assert(!failOrder, "No order document created on stock failure");

  console.log("\n--- SECTION 6: Cart Clear Failure & Retry Recovery (Mandatory 3) ---");

  // Put 1 unit of A1 in cart (stock is currently 8)
  await Cart.updateOne(
    { user: testUser._id },
    {
      $set: {
        items: [
          { product: productA._id, variantId: varA1Id, quantity: 1, priceSnapshot: 9000, nameSnapshot: "A1", variantSnapshot: "Black / 128GB", imageSnapshot: "/img.jpg" }
        ]
      }
    }
  );

  const attemptCartClearFailId = "attempt-cart-clear-fail-001";

  // Mock Cart.updateOne temporarily to simulate cart clear failure during order creation
  const originalCartUpdateOne = Cart.updateOne;
  let cartClearAttempted = false;
  Cart.updateOne = async function (filter, update, opts) {
    if (update && update.$set && Array.isArray(update.$set.items) && update.$set.items.length === 0 && !cartClearAttempted) {
      cartClearAttempted = true;
      throw new Error("Simulated Database Error: Cart clear failed after order save!");
    }
    return originalCartUpdateOne.apply(this, arguments);
  };

  const firstAttemptRes = await orderService.createCODOrder(testUser._id, testAddress._id, null, attemptCartClearFailId);
  // Restore Cart.updateOne
  Cart.updateOne = originalCartUpdateOne;

  assert(!firstAttemptRes.success, "First attempt returned failure due to cart clear error");
  assert(firstAttemptRes.message.includes("Cart clear failed"), `Failure message mentions cart clear: ${firstAttemptRes.message}`);

  // Verify stock WAS decremented for this order (8 -> 7) and order was saved
  const checkStockAfterCartFail = await Product.findById(productA._id);
  assert(checkStockAfterCartFail.variants.id(varA1Id).stock === 7, `Stock decremented to 7 and preserved because order was saved (got ${checkStockAfterCartFail.variants.id(varA1Id).stock})`);

  const savedOrder = await Order.findOne({ idempotencyKey: attemptCartClearFailId });
  assert(savedOrder !== null, "Order was safely saved in database");

  // Now the client retries with the SAME attempt ID
  const retryAfterCartFail = await orderService.createCODOrder(testUser._id, testAddress._id, null, attemptCartClearFailId);
  assert(retryAfterCartFail.success, "Retry succeeds using idempotency");
  assert(retryAfterCartFail.orderNumber === savedOrder.orderNumber, "Retry returns saved order");

  // Verify stock was NOT decremented again (still 7)
  const checkStockAfterRetry = await Product.findById(productA._id);
  assert(checkStockAfterRetry.variants.id(varA1Id).stock === 7, `Stock NOT decremented again on retry (still 7, got ${checkStockAfterRetry.variants.id(varA1Id).stock})`);

  // Verify cart is now successfully cleared
  const cartCleaned = await Cart.findOne({ user: testUser._id });
  assert(cartCleaned.items.length === 0, "Cart eventually reached empty state on retry");

  console.log("\n--- SECTION 7: Same Variant Duplication Aggregation (Mandatory 4) ---");

  // Manually put duplicate variant entries into cart (Variant A1 with qty 1 and qty 2 = total 3)
  await Cart.updateOne(
    { user: testUser._id },
    {
      $set: {
        items: [
          { product: productA._id, variantId: varA1Id, quantity: 1, priceSnapshot: 9000, nameSnapshot: "A1", variantSnapshot: "Black / 128GB", imageSnapshot: "/img.jpg" },
          { product: productA._id, variantId: varA1Id, quantity: 2, priceSnapshot: 9000, nameSnapshot: "A1", variantSnapshot: "Black / 128GB", imageSnapshot: "/img.jpg" }
        ]
      }
    }
  );

  const attemptDupVariant = "attempt-dup-variant-001";
  const dupVariantRes = await orderService.createCODOrder(testUser._id, testAddress._id, null, attemptDupVariant);
  assert(dupVariantRes.success, "Order with duplicate cart entries placed successfully");

  // Verify total stock was decremented by aggregated quantity (3): 7 -> 4
  const checkStockDup = await Product.findById(productA._id);
  assert(checkStockDup.variants.id(varA1Id).stock === 4, `Stock decremented by aggregated quantity 3 (7 -> ${checkStockDup.variants.id(varA1Id).stock})`);

  // Verify order item was aggregated into single item with quantity 3
  const orderDup = await Order.findById(dupVariantRes.orderId);
  assert(orderDup.items.length === 1, "Order snapshot aggregated into 1 item");
  assert(orderDup.items[0].quantity === 3, "Order snapshot item quantity is 3");
  assert(orderDup.items[0].itemTotal === 27000, "Order snapshot itemTotal is 27000");

  console.log("\n--- SECTION 8: Cancellation & Return Stock Lifecycle (Part 34: 21-29) ---");

  // Cancel item level on orderDup
  const cancelItemRes = await orderService.cancelOrderItem(orderDup._id, orderDup.items[0]._id, "Found better price");
  assert(cancelItemRes.success, "cancelOrderItem succeeds");

  // Verify stock restored (4 -> 7)
  const checkStockAfterCancelItem = await Product.findById(productA._id);
  assert(checkStockAfterCancelItem.variants.id(varA1Id).stock === 7, "Stock restored by 3 after item cancellation (4 -> 7)");

  const orderAfterItemCancel = await Order.findById(orderDup._id);
  assert(orderAfterItemCancel.items[0].itemStatus === "CANCELLED", "Item status is CANCELLED");
  assert(orderAfterItemCancel.items[0].isStockRestored === true, "isStockRestored is true");
  assert(orderAfterItemCancel.orderStatus === "CANCELLED", "Order status transitioned to CANCELLED since all items are cancelled");

  // Repeated item cancellation rejected
  const repeatCancel = await orderService.cancelOrderItem(orderDup._id, orderDup.items[0]._id, "Cancel again");
  assert(!repeatCancel.success, "Repeated item cancellation rejected");
  const checkStockRepeatCancel = await Product.findById(productA._id);
  assert(checkStockRepeatCancel.variants.id(varA1Id).stock === 7, "Stock not restored twice on repeated cancellation (still 7)");

  // Cancelled item cannot be returned
  const cancelThenReturn = await orderService.requestReturnItem(orderDup._id, testUser._id, orderDup.items[0]._id, "Defective");
  assert(!cancelThenReturn.success, "Cancelled item cannot be returned");

  // Test full cancellation on order1 (has 2 active items: A1 qty 2, A2 qty 1)
  const fullCancelRes = await orderService.cancelOrder(order1._id, "User requested cancellation");
  assert(fullCancelRes.success, "Full order cancellation succeeds");

  const checkStockAfterFullCancel = await Product.findById(productA._id);
  assert(checkStockAfterFullCancel.variants.id(varA1Id).stock === 9, "A1 stock restored by 2 (7 -> 9)");
  assert(checkStockAfterFullCancel.variants.id(varA2Id).stock === 5, "A2 stock restored by 1 (4 -> 5)");

  // Repeated full cancellation rejected
  const repeatFullCancel = await orderService.cancelOrder(order1._id, "Cancel again");
  assert(!repeatFullCancel.success, "Repeated full cancellation rejected");
  const checkStockRepeatFullCancel = await Product.findById(productA._id);
  assert(checkStockRepeatFullCancel.variants.id(varA1Id).stock === 9, "Stock not restored twice (still 9)");

  // Test Return Approval & Idempotency:
  // Create an order, advance status to DELIVERED, request return, reject, request again, approve
  await Cart.updateOne(
    { user: testUser._id },
    {
      $set: {
        items: [
          { product: productA._id, variantId: varA1Id, quantity: 1, priceSnapshot: 9000, nameSnapshot: "A1", variantSnapshot: "Black / 128GB", imageSnapshot: "/img.jpg" }
        ]
      }
    }
  );
  const returnOrderRes = await orderService.createCODOrder(testUser._id, testAddress._id, null, "attempt-return-001");
  const returnOrderObj = await Order.findById(returnOrderRes.orderId);
  // Stock became 9 -> 8
  const checkStockPreReturn = await Product.findById(productA._id);
  assert(checkStockPreReturn.variants.id(varA1Id).stock === 8, "Stock decremented to 8 for return test order");

  // Advance to DELIVERED
  returnOrderObj.orderStatus = "DELIVERED";
  await returnOrderObj.save();

  // 24. Pending return does NOT restore stock
  const reqReturnRes = await orderService.requestReturn(returnOrderObj._id, testUser._id, "Defective device");
  assert(reqReturnRes.success, "requestReturn submitted successfully");
  const checkStockPendingReturn = await Product.findById(productA._id);
  assert(checkStockPendingReturn.variants.id(varA1Id).stock === 8, "Stock unchanged during pending return (still 8)");

  // 25. Rejected return does NOT restore stock
  const rejectReturnRes = await orderService.rejectReturnRequest(returnOrderObj._id, "Policy violation");
  assert(rejectReturnRes.success, "rejectReturnRequest succeeded");
  const checkStockRejectReturn = await Product.findById(productA._id);
  assert(checkStockRejectReturn.variants.id(varA1Id).stock === 8, "Stock unchanged after rejection (still 8)");

  // Re-request and approve
  await Order.updateOne({ _id: returnOrderObj._id }, { $set: { "returnRequest.status": "NONE" } });
  await orderService.requestReturn(returnOrderObj._id, testUser._id, "Device malfunction");

  // 26. Approved return restores once
  const approveReturnRes = await orderService.approveReturnRequest(returnOrderObj._id);
  assert(approveReturnRes.success, "approveReturnRequest succeeded");
  const checkStockApproveReturn = await Product.findById(productA._id);
  assert(checkStockApproveReturn.variants.id(varA1Id).stock === 9, "Stock restored exactly once on approval (8 -> 9)");

  // 27. Repeated return approval rejected / stock unchanged
  const repeatApproveRes = await orderService.approveReturnRequest(returnOrderObj._id);
  assert(!repeatApproveRes.success, "Repeated return approval rejected");
  const checkStockRepeatApprove = await Product.findById(productA._id);
  assert(checkStockRepeatApprove.variants.id(varA1Id).stock === 9, "Stock not restored twice on repeated approval (still 9)");

  // Returned order cannot be cancelled
  const cancelReturnedOrder = await orderService.cancelOrder(returnOrderObj._id, "Cancel returned");
  assert(!cancelReturnedOrder.success, "Returned order cannot be cancelled");

  console.log("\n--- SECTION 9: Concurrency Test (Part 34: 30) ---");
  // Two users try to buy product B variant 1 (stock: 1) concurrently
  await Cart.updateOne(
    { user: testUser._id },
    {
      $set: {
        items: [
          { product: productB._id, variantId: varB1Id, quantity: 1, priceSnapshot: 7000, nameSnapshot: "B1", variantSnapshot: "Gold / 64GB", imageSnapshot: "/img.jpg" }
        ]
      }
    }
  );
  await Cart.updateOne(
    { user: testUser2._id },
    {
      $set: {
        items: [
          { product: productB._id, variantId: varB1Id, quantity: 1, priceSnapshot: 7000, nameSnapshot: "B1", variantSnapshot: "Gold / 64GB", imageSnapshot: "/img.jpg" }
        ]
      }
    }
  );

  const [race1, race2] = await Promise.all([
    orderService.createCODOrder(testUser._id, testAddress._id, null, "race-attempt-1"),
    orderService.createCODOrder(testUser2._id, testAddress2._id, null, "race-attempt-2")
  ]);

  const successCount = (race1.success ? 1 : 0) + (race2.success ? 1 : 0);
  assert(successCount === 1, "Exactly one of two concurrent buyers succeeded on last stock unit");

  const checkStockRace = await Product.findById(productB._id);
  assert(checkStockRace.variants.id(varB1Id).stock === 0, "Stock of Product B is exactly 0 (never negative)");

  console.log("\n--- SECTION 10: Snapshot Immutability & Financial Tests (Part 35 & Mandatory 5 & 6) ---");

  // Create an order to test snapshot immutability
  await Cart.updateOne(
    { user: testUser._id },
    {
      $set: {
        items: [
          { product: productA._id, variantId: varA1Id, quantity: 2, priceSnapshot: 9000, nameSnapshot: "A1", variantSnapshot: "Black / 128GB", imageSnapshot: "/img.jpg" }
        ]
      }
    }
  );
  const snapOrderRes = await orderService.createCODOrder(testUser._id, testAddress._id, null, "snapshot-test-001");
  const snapOrder = await Order.findById(snapOrderRes.orderId);

  assert(snapOrder.items[0].regularPrice === 10000, "Snapshotted regularPrice is 10000");
  assert(snapOrder.items[0].salePrice === 9000, "Snapshotted salePrice is 9000");
  assert(snapOrder.items[0].sku === `SKU-A1-${testSuffix}`, "Snapshotted SKU is correct");
  assert(snapOrder.items[0].itemTotal === 18000, "Snapshotted itemTotal is 18000");

  // Mutate product price, name, and unlist variant in DB
  await Product.updateOne(
    { _id: productA._id, "variants._id": varA1Id },
    {
      $set: {
        name: "MODIFIED NAME",
        "variants.$.regularPrice": 99999,
        "variants.$.salePrice": 88888,
        "variants.$.sku": "CHANGED-SKU",
        "variants.$.isListed": false
      }
    }
  );

  // Mutate user's address in DB
  await Address.updateOne(
    { _id: testAddress._id },
    { $set: { fullName: "COMPLETELY CHANGED NAME", addressLine1: "MODIFIED STREET" } }
  );

  // Re-fetch order from DB
  const snapOrderAfterMutations = await Order.findById(snapOrder._id);
  assert(snapOrderAfterMutations.items[0].regularPrice === 10000, "Historical regularPrice remains 10000 after product edit");
  assert(snapOrderAfterMutations.items[0].salePrice === 9000, "Historical salePrice remains 9000 after product edit");
  assert(snapOrderAfterMutations.items[0].sku === `SKU-A1-${testSuffix}`, "Historical SKU remains unchanged after product edit");
  assert(snapOrderAfterMutations.items[0].productName === `Product A ${testSuffix}`, "Historical productName remains unchanged");
  assert(snapOrderAfterMutations.shippingAddress.fullName === "Test Customer", "Historical address fullName remains Test Customer");
  assert(snapOrderAfterMutations.shippingAddress.addressLine1 === "123 Test Street", "Historical addressLine1 remains 123 Test Street");
  assert(snapOrderAfterMutations.subtotal === 18000, "Historical subtotal remains 18000");
  assert(snapOrderAfterMutations.finalAmount === 18000, "Historical finalAmount remains 18000");

  console.log("\n--- SECTION 11: Security & Ownership Tests (Part 36) ---");

  // User 2 tries to cancel User 1's order via orderController
  let mockResStatus = 0;
  let mockResJson = null;
  const mockRes = {
    status(code) { mockResStatus = code; return this; },
    json(data) { mockResJson = data; return this; }
  };
  const mockReqUser2 = {
    session: { user: { id: testUser2._id } },
    params: { id: snapOrder._id.toString() },
    body: { reason: "Malicious cancel" }
  };

  await orderController.cancelOrder(mockReqUser2, mockRes, () => {});
  assert(mockResStatus === 404, "User 2 cannot cancel User 1's order (HTTP 404 returned)");

  // Clean up test data
  await Order.deleteMany({ user: { $in: [testUser._id, testUser2._id] } });
  await Cart.deleteMany({ user: { $in: [testUser._id, testUser2._id] } });
  await Address.deleteMany({ userId: { $in: [testUser._id, testUser2._id] } });
  await Product.deleteMany({ _id: { $in: [productA._id, productB._id] } });
  await Category.deleteOne({ _id: testCategory._id });
  await Brand.deleteOne({ _id: testBrand._id });
  await User.deleteMany({ _id: { $in: [testUser._id, testUser2._id] } });

  await mongoose.disconnect();

  console.log("\n============================================================");
  console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution aborted with error:", err);
  process.exit(1);
});
