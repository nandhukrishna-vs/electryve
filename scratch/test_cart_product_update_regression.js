import 'dotenv/config';
import mongoose from 'mongoose';
import crypto from 'crypto';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import Brand from '../src/models/Brand.js';
import User from '../src/models/User.js';
import Cart from '../src/models/Cart.js';
import Offer from '../src/models/Offer.js';
import Coupon from '../src/models/Coupon.js';
import * as cartService from '../src/services/cartService.js';
import * as productService from '../src/services/productService.js';
import * as orderService from '../src/services/orderService.js';
import { validateUserCoupon } from '../src/services/couponService.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedTests++;
  }
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log('🚀 ELECTRYVE CART & PRODUCT UPDATE REGRESSION TEST SUITE');
  console.log('===============================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);

  const testSuffix = crypto.randomBytes(4).toString('hex');

  // Setup test Category & Brand
  const testCat = await Category.create({
    name: `TestCat_${testSuffix}`,
    slug: `testcat-${testSuffix}`,
    isListed: true,
    isDeleted: false
  });

  const testBrand = await Brand.create({
    name: `TestBrand_${testSuffix}`,
    slug: `testbrand-${testSuffix}`,
    isListed: true,
    isDeleted: false
  });

  // Setup test User
  const testUser = await User.create({
    fullName: `Test User ${testSuffix}`,
    email: `testcart_${testSuffix}@example.com`,
    password: "hashedPassword123",
    role: "USER",
    isBlocked: false
  });

  const dummyImage = "https://electryve-assets-nandhukrishna.s3.ap-south-1.amazonaws.com/products/test1.jpg";
  const dummyImage2 = "https://electryve-assets-nandhukrishna.s3.ap-south-1.amazonaws.com/products/test2.jpg";
  const dummyImage3 = "https://electryve-assets-nandhukrishna.s3.ap-south-1.amazonaws.com/products/test3.jpg";
  const dummyImage4 = "https://electryve-assets-nandhukrishna.s3.ap-south-1.amazonaws.com/products/test4.jpg";

  // Create primary test product with 2 variants
  const testProduct = await Product.create({
    name: `Test Gadget ${testSuffix}`,
    slug: `test-gadget-${testSuffix}`,
    description: "A flagship testing electronic device for full cart regression checks.",
    category: testCat._id,
    brand: testBrand._id,
    isListed: true,
    isDeleted: false,
    variants: [
      {
        color: "Midnight Black",
        storage: "128GB",
        sku: `SKU-BLK-${testSuffix}`,
        regularPrice: 80000,
        salePrice: 75000,
        stock: 10,
        images: [dummyImage, dummyImage2, dummyImage3],
        isListed: true
      },
      {
        color: "Silver Frost",
        storage: "256GB",
        sku: `SKU-SLV-${testSuffix}`,
        regularPrice: 90000,
        salePrice: 85000,
        stock: 5,
        images: [dummyImage, dummyImage2, dummyImage3],
        isListed: true
      }
    ]
  });

  const varA = testProduct.variants[0];
  const varB = testProduct.variants[1];
  const initialVarAId = varA._id.toString();
  const initialVarBId = varB._id.toString();

  try {
    // -------------------------------------------------------------
    // Test 10: Stable productId/variantId identity
    // -------------------------------------------------------------
    console.log('--- Test 10: Stable productId/variantId Identity ---');
    const addRes = await cartService.addToCart(testUser._id, testProduct._id, varA._id, 2);
    assert(addRes.success === true, "Item added to cart successfully");
    
    let cart = await cartService.getCart(testUser._id);
    assert(cart.items.length === 1, "Cart has 1 item");
    assert(cart.items[0].product._id.toString() === testProduct._id.toString(), "Cart item has correct productId");
    assert(cart.items[0].variantId.toString() === initialVarAId, "Cart item has stable variantId");
    assert(cart.items[0].quantity === 2, "Cart item quantity is 2");
    assert(cart.items[0].isAvailable === true, "Cart item is available");

    // -------------------------------------------------------------
    // Test 1: Cart item remains valid after regular price change
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Regular Price Change ---');
    const updateBodyReg = {
      name: testProduct.name,
      description: testProduct.description,
      category: testCat._id.toString(),
      brand: testBrand._id.toString(),
      variants: [
        {
          _id: initialVarAId,
          color: varA.color,
          storage: varA.storage,
          sku: varA.sku,
          regularPrice: 85000, // changed from 80000
          salePrice: varA.salePrice,
          stock: varA.stock,
          existingImages: varA.images
        },
        {
          _id: initialVarBId,
          color: varB.color,
          storage: varB.storage,
          sku: varB.sku,
          regularPrice: varB.regularPrice,
          salePrice: varB.salePrice,
          stock: varB.stock,
          existingImages: varB.images
        }
      ]
    };

    const updateResReg = await productService.updateProduct({ id: testProduct._id, body: updateBodyReg });
    assert(updateResReg.success === true, "Admin product update succeeded");
    
    // Check variant _id preservation
    const refreshedProd1 = await Product.findById(testProduct._id);
    assert(refreshedProd1.variants[0]._id.toString() === initialVarAId, "Variant A _id preserved in DB");
    assert(refreshedProd1.variants[1]._id.toString() === initialVarBId, "Variant B _id preserved in DB");

    cart = await cartService.getCart(testUser._id);
    assert(cart.items.length === 1, "Cart still contains 1 item");
    assert(cart.items[0].isAvailable === true, "Item remains available after regularPrice change");
    assert(cart.items[0].regularPrice === 85000, "Reflected updated regularPrice");
    assert(cart.canCheckout === true, "Cart canCheckout is true");

    // -------------------------------------------------------------
    // Test 2: Cart item remains valid after sale price change
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Sale Price Change & Totals Recalculation ---');
    const updateBodySale = {
      name: testProduct.name,
      description: testProduct.description,
      category: testCat._id.toString(),
      brand: testBrand._id.toString(),
      variants: [
        {
          _id: initialVarAId,
          color: varA.color,
          storage: varA.storage,
          sku: varA.sku,
          regularPrice: 85000,
          salePrice: 70000, // changed from 75000 to 70000
          stock: varA.stock,
          existingImages: varA.images
        },
        {
          _id: initialVarBId,
          color: varB.color,
          storage: varB.storage,
          sku: varB.sku,
          regularPrice: varB.regularPrice,
          salePrice: varB.salePrice,
          stock: varB.stock,
          existingImages: varB.images
        }
      ]
    };

    await productService.updateProduct({ id: testProduct._id, body: updateBodySale });
    cart = await cartService.getCart(testUser._id);
    assert(cart.items[0].isAvailable === true, "Item remains available after salePrice change");
    assert(cart.items[0].currentUnitPrice === 70000, "Current unit price updated to 70000");
    assert(cart.items[0].priceChanged === true, "priceChanged flag is true");
    assert(cart.items[0].itemTotal === 140000, "Item total recalculated (2 * 70000 = 140000)");
    assert(cart.cartSummary.subtotal === 140000, "Cart subtotal matches updated prices");
    assert(cart.priceChanges.length > 0, "Useful price alert generated");

    // -------------------------------------------------------------
    // Test 3: Cart item remains valid after image change
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Product Image Change ---');
    const updateBodyImg = {
      name: testProduct.name,
      description: testProduct.description,
      category: testCat._id.toString(),
      brand: testBrand._id.toString(),
      variants: [
        {
          _id: initialVarAId,
          color: varA.color,
          storage: varA.storage,
          sku: varA.sku,
          regularPrice: 85000,
          salePrice: 70000,
          stock: varA.stock,
          existingImages: [dummyImage4, dummyImage2, dummyImage3] // image changed
        },
        {
          _id: initialVarBId,
          color: varB.color,
          storage: varB.storage,
          sku: varB.sku,
          regularPrice: varB.regularPrice,
          salePrice: varB.salePrice,
          stock: varB.stock,
          existingImages: varB.images
        }
      ]
    };

    await productService.updateProduct({ id: testProduct._id, body: updateBodyImg });
    cart = await cartService.getCart(testUser._id);
    assert(cart.items[0].isAvailable === true, "Item remains available after image change");
    assert(cart.items[0].imageSnapshot === dummyImage4, "Cart image snapshot updated to new image");

    // -------------------------------------------------------------
    // Test 4: Cart item remains valid after name change
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Product Name Change ---');
    const newName = `Test Gadget SuperPro ${testSuffix}`;
    const updateBodyName = {
      name: newName,
      description: testProduct.description,
      category: testCat._id.toString(),
      brand: testBrand._id.toString(),
      variants: updateBodyImg.variants
    };

    await productService.updateProduct({ id: testProduct._id, body: updateBodyName });
    cart = await cartService.getCart(testUser._id);
    assert(cart.items[0].isAvailable === true, "Item remains available after name change");
    assert(cart.items[0].nameSnapshot === newName, "Cart name snapshot updated to new name");

    // -------------------------------------------------------------
    // Test 5: Offer recalculates after price change
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Offer Recalculation ---');
    const testOffer = await Offer.create({
      name: `Test 10% Off ${testSuffix}`,
      scope: "PRODUCT",
      products: [testProduct._id],
      discountType: "PERCENTAGE",
      discountValue: 10,
      isActive: true,
      startAt: new Date(Date.now() - 10000),
      expiryAt: new Date(Date.now() + 86400000)
    });

    cart = await cartService.getCart(testUser._id);
    assert(cart.items[0].appliedOffer !== null, "Product offer detected");
    assert(cart.items[0].appliedOffer.offerName === testOffer.name || cart.items[0].appliedOffer.name === testOffer.name, "Correct offer applied");
    assert(cart.items[0].effectiveItemPrice === 63000, "10% off on 70000 gives 63000");
    assert(cart.items[0].itemTotal === 126000, "Item total with offer is 2 * 63000 = 126000");
    assert(cart.cartSummary.totalOfferDiscount === 14000, "Total offer discount is 14000");
    assert(cart.cartSummary.subtotal === 126000, "Subtotal is offer-adjusted 126000");

    await Offer.findByIdAndDelete(testOffer._id);

    // -------------------------------------------------------------
    // Test 6: Stock reduction handled correctly
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Stock Reduction Handling ---');
    // Reduce stock to 1 when user has quantity 2
    const updateBodyStock = {
      name: newName,
      description: testProduct.description,
      category: testCat._id.toString(),
      brand: testBrand._id.toString(),
      variants: [
        {
          _id: initialVarAId,
          color: varA.color,
          storage: varA.storage,
          sku: varA.sku,
          regularPrice: 85000,
          salePrice: 70000,
          stock: 1, // reduced from 10 to 1
          existingImages: [dummyImage4, dummyImage2, dummyImage3]
        },
        {
          _id: initialVarBId,
          color: varB.color,
          storage: varB.storage,
          sku: varB.sku,
          regularPrice: varB.regularPrice,
          salePrice: varB.salePrice,
          stock: varB.stock,
          existingImages: varB.images
        }
      ]
    };

    await productService.updateProduct({ id: testProduct._id, body: updateBodyStock });
    cart = await cartService.getCart(testUser._id);
    assert(cart.items[0].isAvailable === true, "Item remains available");
    assert(cart.items[0].quantity === 1, "Quantity clamped down to available stock (1)");
    assert(cart.canCheckout === true, "Can checkout with clamped stock");

    // -------------------------------------------------------------
    // Test 7: Zero stock produces out-of-stock
    // -------------------------------------------------------------
    console.log('\n--- Test 7: Zero Stock Produces Out-of-Stock ---');
    const updateBodyZeroStock = {
      name: newName,
      description: testProduct.description,
      category: testCat._id.toString(),
      brand: testBrand._id.toString(),
      variants: [
        {
          _id: initialVarAId,
          color: varA.color,
          storage: varA.storage,
          sku: varA.sku,
          regularPrice: 85000,
          salePrice: 70000,
          stock: 0, // stock = 0
          existingImages: [dummyImage4, dummyImage2, dummyImage3]
        },
        {
          _id: initialVarBId,
          color: varB.color,
          storage: varB.storage,
          sku: varB.sku,
          regularPrice: varB.regularPrice,
          salePrice: varB.salePrice,
          stock: varB.stock,
          existingImages: varB.images
        }
      ]
    };

    await productService.updateProduct({ id: testProduct._id, body: updateBodyZeroStock });
    cart = await cartService.getCart(testUser._id);
    assert(cart.items[0].isOutOfStock === true, "Item is flagged as isOutOfStock: true");
    assert(cart.items[0].isUnavailable === false, "Item is NOT marked isUnavailable (it is specifically out of stock)");
    assert(cart.canCheckout === false, "Checkout blocked due to out-of-stock item");
    assert(cart.cartSummary.subtotal === 0, "Out-of-stock item excluded from subtotal");

    // Restore stock for subsequent tests
    updateBodyStock.variants[0].stock = 10;
    await productService.updateProduct({ id: testProduct._id, body: updateBodyStock });

    // -------------------------------------------------------------
    // Test 8: Variant deletion produces unavailable
    // -------------------------------------------------------------
    console.log('\n--- Test 8: Variant Deletion Produces Unavailable ---');
    // Add Variant B to cart first
    await cartService.addToCart(testUser._id, testProduct._id, varB._id, 1);
    cart = await cartService.getCart(testUser._id);
    assert(cart.items.length === 2, "Cart now has 2 items (Var A and Var B)");

    // Admin updates product and removes Variant B
    const updateBodyRemoveB = {
      name: newName,
      description: testProduct.description,
      category: testCat._id.toString(),
      brand: testBrand._id.toString(),
      variants: [
        {
          _id: initialVarAId,
          color: varA.color,
          storage: varA.storage,
          sku: varA.sku,
          regularPrice: 85000,
          salePrice: 70000,
          stock: 10,
          existingImages: [dummyImage4, dummyImage2, dummyImage3]
        }
      ]
    };

    await productService.updateProduct({ id: testProduct._id, body: updateBodyRemoveB });
    cart = await cartService.getCart(testUser._id);
    assert(cart.items.length === 2, "Cart still lists both items");
    const itemA = cart.items.find(it => it.variantId.toString() === initialVarAId);
    const itemB = cart.items.find(it => it.variantId.toString() === initialVarBId);
    assert(itemA && itemA.isAvailable === true, "Variant A remains available");
    assert(itemB && itemB.isUnavailable === true, "Truly deleted Variant B is marked isUnavailable: true");
    assert(cart.canCheckout === false, "Checkout blocked because cart has an unavailable item");

    // Remove deleted item from cart
    await cartService.removeItem(testUser._id, testProduct._id, varB._id);

    // -------------------------------------------------------------
    // Test 9: Product unlisting/deletion produces unavailable
    // -------------------------------------------------------------
    console.log('\n--- Test 9: Product Deletion/Unlisting Produces Unavailable ---');
    await Product.findByIdAndUpdate(testProduct._id, { isListed: false });
    cart = await cartService.getCart(testUser._id);
    assert(cart.items[0].isUnavailable === true, "Unlisted product is marked isUnavailable: true");
    assert(cart.canCheckout === false, "canCheckout is false for unlisted product");

    await Product.findByIdAndUpdate(testProduct._id, { isListed: true });

    // -------------------------------------------------------------
    // Test 11: Current price used for totals
    // -------------------------------------------------------------
    console.log('\n--- Test 11: Current Price Used for Totals ---');
    cart = await cartService.getCart(testUser._id);
    assert(cart.items[0].isAvailable === true, "Product available again");
    assert(cart.items[0].currentUnitPrice === 70000, "Current unit price is 70000");
    assert(cart.cartSummary.subtotal === 70000, "Subtotal accurately uses 70000");

    // -------------------------------------------------------------
    // Test 12 & 14: Checkout revalidation & no stale price in checkout
    // -------------------------------------------------------------
    console.log('\n--- Test 12 & 14: Checkout Revalidates Authoritative Current State ---');
    // Admin changes price again to 72000
    const updateBodyCheckout = {
      name: newName,
      description: testProduct.description,
      category: testCat._id.toString(),
      brand: testBrand._id.toString(),
      variants: [
        {
          _id: initialVarAId,
          color: varA.color,
          storage: varA.storage,
          sku: varA.sku,
          regularPrice: 85000,
          salePrice: 72000,
          stock: 10,
          existingImages: [dummyImage4, dummyImage2, dummyImage3]
        }
      ]
    };
    await productService.updateProduct({ id: testProduct._id, body: updateBodyCheckout });

    // When cart is fetched for checkout, it immediately reflects authoritative price 72000
    cart = await cartService.getCart(testUser._id);
    assert(cart.items[0].currentUnitPrice === 72000, "Checkout reads fresh price 72000");
    assert(cart.cartSummary.subtotal === 72000, "Checkout subtotal uses 72000");

    // -------------------------------------------------------------
    // Test 13: Multiple cart items behave independently
    // -------------------------------------------------------------
    console.log('\n--- Test 13: Multiple Cart Items Behave Independently ---');
    const testProd2 = await Product.create({
      name: `Independent Product ${testSuffix}`,
      slug: `independent-product-${testSuffix}`,
      description: "Another test product for multiple item independence.",
      category: testCat._id,
      brand: testBrand._id,
      isListed: true,
      isDeleted: false,
      variants: [
        {
          color: "Blue",
          storage: "64GB",
          sku: `SKU-IND-${testSuffix}`,
          regularPrice: 5000,
          salePrice: 4000,
          stock: 3,
          images: [dummyImage, dummyImage2, dummyImage3],
          isListed: true
        }
      ]
    });

    await cartService.addToCart(testUser._id, testProd2._id, testProd2.variants[0]._id, 1);
    cart = await cartService.getCart(testUser._id);
    assert(cart.items.length === 2, "Cart has 2 distinct products");
    assert(cart.items.every(it => it.isAvailable === true), "Both items are available");
    assert(cart.cartSummary.subtotal === 76000, "Subtotal correctly sums both items (72000 + 4000 = 76000)");

    // -------------------------------------------------------------
    // Test 15: Coupon logic remains intact with price updates
    // -------------------------------------------------------------
    console.log('\n--- Test 15: Session Coupon Logic Intact ---');
    const testCoupon = await Coupon.create({
      code: `SAVE10_${testSuffix}`.toUpperCase(),
      discountType: "FIXED",
      discountValue: 1000,
      minPurchaseAmount: 75000, // minPurchaseAmount is 75000
      maxDiscountAmount: 1000,
      startDate: new Date(Date.now() - 10000),
      expiryDate: new Date(Date.now() + 86400000),
      isActive: true,
      usageLimit: 100
    });

    // Subtotal is 76000 -> coupon should be valid
    const couponValPass = await validateUserCoupon(testUser._id, testCoupon.code, cart.cartSummary.subtotal);
    assert(couponValPass.success === true, "Coupon valid when subtotal (76000) >= minPurchase (75000)");

    // Now remove product 2 so subtotal drops to 72000 (< 75000)
    await cartService.removeItem(testUser._id, testProd2._id, testProd2.variants[0]._id);
    cart = await cartService.getCart(testUser._id);
    const couponValFail = await validateUserCoupon(testUser._id, testCoupon.code, cart.cartSummary.subtotal);
    assert(couponValFail.success === false, "Coupon correctly invalidated when subtotal (72000) drops below minPurchase (75000)");

    await Coupon.findByIdAndDelete(testCoupon._id);
    await Product.findByIdAndDelete(testProd2._id);

  } finally {
    // Cleanup test artifacts
    await Cart.deleteOne({ user: testUser._id });
    await Product.findByIdAndDelete(testProduct._id);
    await Category.findByIdAndDelete(testCat._id);
    await Brand.findByIdAndDelete(testBrand._id);
    await User.findByIdAndDelete(testUser._id);
    await mongoose.disconnect();
  }

  console.log('\n===============================================================');
  console.log(`FINAL RESULT: ${passedTests} passed, ${failedTests} failed`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error("Test execution error:", err);
  process.exit(1);
});
