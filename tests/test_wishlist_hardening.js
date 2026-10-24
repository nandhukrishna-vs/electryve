import mongoose from "mongoose";
import * as dotenv from "dotenv";
dotenv.config();

import Wishlist from "../src/models/Wishlist.js";
import User from "../src/models/User.js";
import Product from "../src/models/Product.js";
import Category from "../src/models/Category.js";
import Brand from "../src/models/Brand.js";
import * as wishlistService from "../src/services/wishlistService.js";

const MONGO_URI =
  process.env.TEST_MONGO_URI ||
  process.env.TEST_MONGODB_URI ||
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/electryve_test";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

async function run() {
  console.log("=== WISHLIST CONCURRENCY & HARDENING TEST SUITE ===");
  await mongoose.connect(MONGO_URI);

  const testUserId = new mongoose.Types.ObjectId();

  try {
    // Test 1: Validation of invalid IDs
    console.log("\n1. Testing ID Validation");
    const resInvalidProduct = await wishlistService.addToWishlist(testUserId, "invalid-product-id", new mongoose.Types.ObjectId());
    assert(resInvalidProduct.success === false, "addToWishlist rejects invalid product ID format");
    assert(resInvalidProduct.message.includes("Invalid product or variant ID format"), `Correct error message: "${resInvalidProduct.message}"`);

    const resInvalidVariant = await wishlistService.addToWishlist(testUserId, new mongoose.Types.ObjectId(), "invalid-variant-id");
    assert(resInvalidVariant.success === false, "addToWishlist rejects invalid variant ID format");
    assert(resInvalidVariant.message.includes("Invalid product or variant ID format"), `Correct error message: "${resInvalidVariant.message}"`);

    // Find an active product with at least 1 listed variant
    let product = await Product.findOne({ isDeleted: false, isListed: true })
      .populate("category")
      .populate("brand");

    if (!product || !product.variants || product.variants.length === 0) {
      console.log("Creating temporary Category, Brand, and Product for testing...");
      const timestamp = Date.now();
      let cat = await Category.findOne({ isDeleted: false, isListed: true });
      if (!cat) {
        cat = await Category.create({ name: "WishlistTestCat" + timestamp, slug: "wishlist-test-cat-" + timestamp, isListed: true });
      }
      let br = await Brand.findOne({ isDeleted: false, isListed: true });
      if (!br) {
        br = await Brand.create({ name: "WishlistTestBrand" + timestamp, slug: "wishlist-test-brand-" + timestamp, isListed: true });
      }
      product = await Product.create({
        name: "Wishlist Test Product " + timestamp,
        slug: "wishlist-test-prod-" + timestamp,
        description: "Test description",
        category: cat._id,
        brand: br._id,
        isListed: true,
        isDeleted: false,
        variants: [
          {
            color: "Black",
            storage: "128GB",
            sku: "WL-TEST-1-" + timestamp,
            regularPrice: 50000,
            salePrice: 45000,
            stock: 10,
            isListed: true,
            images: ["test1.jpg", "test2.jpg", "test3.jpg"]
          },
          {
            color: "White",
            storage: "256GB",
            sku: "WL-TEST-2-" + timestamp,
            regularPrice: 60000,
            salePrice: 55000,
            stock: 10,
            isListed: true,
            images: ["test1.jpg", "test2.jpg", "test3.jpg"]
          }
        ]
      });
      product = await Product.findById(product._id).populate("category").populate("brand");
    }

    // Ensure we have two variant IDs to test with
    const testProductId = product._id;
    const testVariantId = product.variants[0]._id;
    let secondVariantId = product.variants.length > 1 ? product.variants[1]._id : new mongoose.Types.ObjectId();

    console.log(`Using product: "${product.name}" (${testProductId}), variant: ${testVariantId}`);

    // Clean up any pre-existing test data
    await Wishlist.deleteMany({ user: testUserId });

    // Test 2: Concurrent Additions of Same Variant
    console.log("\n2. Testing Concurrent Duplicate Additions");
    const parallelCalls = 10;
    const promises = [];
    for (let i = 0; i < parallelCalls; i++) {
      promises.push(wishlistService.addToWishlist(testUserId, testProductId, testVariantId));
    }

    const results = await Promise.all(promises);
    const addedCount = results.filter(r => r.success && !r.alreadyExists).length;
    const duplicateCount = results.filter(r => r.success && r.alreadyExists).length;

    console.log(`  Concurrent results: ${addedCount} added, ${duplicateCount} reported alreadyExists`);
    assert(addedCount === 1, "Exactly 1 call performed the initial addition");
    assert(duplicateCount === parallelCalls - 1, "All other concurrent calls were recognized as duplicates without race conditions");

    const wishlistInDb = await Wishlist.findOne({ user: testUserId });
    assert(wishlistInDb !== null, "Wishlist document was created in DB");
    assert(wishlistInDb.items.length === 1, `DB items length is 1, no duplicate entries (found ${wishlistInDb.items.length})`);

    // Test 3: Status check
    console.log("\n3. Testing Status Check");
    const inWishlist = await wishlistService.isInWishlist(testUserId, testProductId, testVariantId);
    assert(inWishlist === true, "isInWishlist returns true for added item");

    const otherVariantInWishlist = await wishlistService.isInWishlist(testUserId, testProductId, secondVariantId);
    assert(otherVariantInWishlist === false, "isInWishlist returns false for different variant");

    // Test 4: Add Second Variant to Same Product (if available)
    if (product.variants.length > 1) {
      console.log("\n4. Testing Adding Second Variant to Existing Wishlist");
      const addSecondResult = await wishlistService.addToWishlist(testUserId, testProductId, secondVariantId);
      assert(addSecondResult.success && !addSecondResult.alreadyExists, "Second variant added successfully");

      const wishlistAfterSecond = await Wishlist.findOne({ user: testUserId });
      assert(wishlistAfterSecond.items.length === 2, `DB now contains 2 variants (found ${wishlistAfterSecond.items.length})`);

      // Test 5: Concurrent Removals
      console.log("\n5. Testing Concurrent Removals");
      const removePromises = [];
      for (let i = 0; i < 5; i++) {
        removePromises.push(wishlistService.removeFromWishlist(testUserId, testProductId, testVariantId));
      }
      await Promise.all(removePromises);
      const wishlistAfterRemove = await Wishlist.findOne({ user: testUserId });
      assert(wishlistAfterRemove.items.length === 1, "After removals, exactly 1 variant remains");
      assert(wishlistAfterRemove.items[0].variantId.toString() === secondVariantId.toString(), "Remaining item is the second variant");
    }

    // Test 6: Deduplication logic on getWishlist (in case legacy data had duplicates)
    console.log("\n6. Testing Legacy Deduplication on getWishlist");
    // Manually push duplicate variant in items array to simulate legacy corrupted data
    await Wishlist.updateOne(
      { user: testUserId },
      {
        $push: {
          items: { product: testProductId, variantId: testVariantId, addedAt: new Date() }
        }
      }
    );
    await Wishlist.updateOne(
      { user: testUserId },
      {
        $push: {
          items: { product: testProductId, variantId: testVariantId, addedAt: new Date() }
        }
      }
    );

    const rawWishlist = await Wishlist.findOne({ user: testUserId });
    console.log(`  Raw items count in DB before getWishlist: ${rawWishlist.items.length}`);
    assert(rawWishlist.items.length >= 2, "Manually inserted raw duplicate variants into items array");

    const processedList = await wishlistService.getWishlist(testUserId);
    const matchingItems = processedList.filter(
      item => String(item.productId) === String(testProductId) && String(item.variantId) === String(testVariantId)
    );
    assert(matchingItems.length === 1, `getWishlist returned deduplicated array with exactly 1 entry for variant (got ${matchingItems.length})`);

    console.log("\n=== SUMMARY ===");
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

  } finally {
    // Cleanup
    await Wishlist.deleteMany({ user: testUserId });
    await mongoose.disconnect();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
