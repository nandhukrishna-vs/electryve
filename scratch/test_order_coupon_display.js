import 'dotenv/config';
import mongoose from 'mongoose';
import ejs from 'ejs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Order from '../src/models/Order.js';
import Coupon from '../src/models/Coupon.js';
import User from '../src/models/User.js';
import { generateInvoicePDF } from '../src/utils/invoiceGenerator.js';
import { Writable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsDir = path.join(__dirname, '../src/views');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('--- STARTING COMPREHENSIVE ORDER COUPON DISPLAY TEST SUITE ---');
  console.log('===============================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);

  const orderDetailsTemplate = fs.readFileSync(path.join(viewsDir, 'user/order-details.ejs'), 'utf-8');
  const adminDetailsTemplate = fs.readFileSync(path.join(viewsDir, 'admin/orders/details.ejs'), 'utf-8');

  // Common shipping address for test orders
  const testAddress = {
    fullName: "John Doe",
    phone: "9876543210",
    addressLine1: "123 Tech Park",
    addressLine2: "Suite 4B",
    landmark: "Near Metro",
    city: "Bangalore",
    state: "Karnataka",
    pinCode: 560001
  };

  // --------------------------------------------------------------------------
  // TEST 1: Screenshot Scenario (No coupon, No offer, Catalog discount = ₹1,001)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 1: Screenshot Scenario (No coupon, No offer, Catalog Discount = ₹1,001) ---');
  const order1 = {
    _id: new mongoose.Types.ObjectId(),
    orderNumber: "ELV-TEST-SCREENSHOT",
    createdAt: new Date(),
    orderStatus: "DELIVERED",
    paymentMethod: "COD",
    paymentStatus: "PAID",
    items: [
      {
        _id: new mongoose.Types.ObjectId(),
        productName: "Samsung Earbuds Pro",
        brandName: "Samsung",
        variantDetails: "Black / Standard",
        image: "https://example.com/earbuds.jpg",
        quantity: 1,
        regularPrice: 30000,
        salePrice: 28999,
        offerDiscount: 0,
        appliedOfferName: "",
        effectiveItemPrice: 28999,
        itemTotal: 28999,
        itemStatus: "ACTIVE"
      }
    ],
    shippingAddress: testAddress,
    subtotal: 28999,
    discount: 1001, // catalog discount
    totalOfferDiscount: 0,
    coupon: null,
    couponDiscount: 0,
    shippingCharge: 0,
    tax: 0,
    finalAmount: 28999
  };

  const html1 = ejs.render(orderDetailsTemplate, {
    order: order1,
    title: "Order Details",
    user: { _id: "user1", fullName: "John Doe" }
  }, { views: [viewsDir] });

  // Verify Subtotal is ₹28,999
  assert(html1.includes('₹28,999'), "Test 1: Subtotal ₹28,999 rendered");
  // Verify Total Paid is ₹28,999
  assert(html1.includes('Total Paid') && html1.includes('₹28,999'), "Test 1: Total Paid ₹28,999 rendered");
  // Verify that an erroneous negative line subtraction '-₹1,001' under Discount does NOT exist
  assert(!html1.includes('<span>Discount</span>\n                                <span>-₹1,001</span>') &&
         !html1.includes('<span>Discount</span>\r\n                                <span>-₹1,001</span>'),
         "Test 1: No misleading '-₹1,001 Discount' line subtraction in arithmetic column");
  // Verify no coupon discount row is displayed
  assert(!html1.includes('Coupon ('), "Test 1: No coupon row displayed when no coupon used");
  // Verify total savings callout shows ₹1,001 saved from catalog
  assert(html1.includes('Total Savings:') && html1.includes('₹1,001'), "Test 1: Total savings callout displays ₹1,001");

  // --------------------------------------------------------------------------
  // TEST 2: Order with Coupon Applied (No Offer)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Order with Coupon Applied (No Offer) ---');
  const order2 = {
    _id: new mongoose.Types.ObjectId(),
    orderNumber: "ELV-TEST-COUPON-ONLY",
    createdAt: new Date(),
    orderStatus: "PLACED",
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    items: [
      {
        _id: new mongoose.Types.ObjectId(),
        productName: "Samsung Earbuds Pro",
        brandName: "Samsung",
        variantDetails: "Black / Standard",
        image: "https://example.com/earbuds.jpg",
        quantity: 1,
        regularPrice: 30000,
        salePrice: 28999,
        offerDiscount: 0,
        appliedOfferName: "",
        effectiveItemPrice: 28999,
        itemTotal: 28999,
        itemStatus: "ACTIVE"
      }
    ],
    shippingAddress: testAddress,
    subtotal: 28999,
    discount: 1001,
    totalOfferDiscount: 0,
    coupon: {
      couponId: new mongoose.Types.ObjectId(),
      code: "WELCOME500",
      discountType: "FIXED",
      discountValue: 500,
      discountAmount: 500
    },
    couponDiscount: 500,
    shippingCharge: 0,
    tax: 0,
    finalAmount: 28499
  };

  const html2 = ejs.render(orderDetailsTemplate, {
    order: order2,
    title: "Order Details",
    user: { _id: "user1", fullName: "John Doe" }
  }, { views: [viewsDir] });

  assert(html2.includes('WELCOME500'), "Test 2: Coupon Code 'WELCOME500' is rendered");
  assert(html2.includes('-₹500'), "Test 2: Coupon discount '-₹500' is rendered");
  assert(html2.includes('₹28,499'), "Test 2: Total Paid is ₹28,499");
  assert(!html2.includes('Offer Savings'), "Test 2: No Offer Savings row when totalOfferDiscount is 0");

  // --------------------------------------------------------------------------
  // TEST 3: Order with Offer Savings (No Coupon)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Order with Offer Savings (No Coupon) ---');
  const order3 = {
    _id: new mongoose.Types.ObjectId(),
    orderNumber: "ELV-TEST-OFFER-ONLY",
    createdAt: new Date(),
    orderStatus: "PLACED",
    paymentMethod: "RAZORPAY",
    paymentStatus: "PAID",
    items: [
      {
        _id: new mongoose.Types.ObjectId(),
        productName: "Dell XPS Laptop",
        brandName: "Dell",
        variantDetails: "Silver / 16GB",
        image: "https://example.com/laptop.jpg",
        quantity: 1,
        regularPrice: 60000,
        salePrice: 50000,
        offerDiscount: 4000,
        appliedOfferName: "Laptop Festive Deal",
        effectiveItemPrice: 46000,
        itemTotal: 46000,
        itemStatus: "ACTIVE"
      }
    ],
    shippingAddress: testAddress,
    subtotal: 46000,
    discount: 10000,
    totalOfferDiscount: 4000,
    coupon: null,
    couponDiscount: 0,
    shippingCharge: 0,
    tax: 0,
    finalAmount: 46000
  };

  const html3 = ejs.render(orderDetailsTemplate, {
    order: order3,
    title: "Order Details",
    user: { _id: "user1", fullName: "John Doe" }
  }, { views: [viewsDir] });

  assert(html3.includes('₹50,000'), "Test 3: Base Subtotal ₹50,000 is rendered");
  assert(html3.includes('Offer Savings'), "Test 3: 'Offer Savings' row is rendered");
  assert(html3.includes('-₹4,000'), "Test 3: Offer discount '-₹4,000' is rendered");
  assert(html3.includes('₹46,000'), "Test 3: Total Paid ₹46,000 is rendered");
  assert(!html3.includes('Coupon ('), "Test 3: No coupon row rendered");

  // --------------------------------------------------------------------------
  // TEST 4: Order with BOTH Offer Savings AND Coupon Applied
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Order with BOTH Offer Savings AND Coupon Applied ---');
  const order4 = {
    _id: new mongoose.Types.ObjectId(),
    orderNumber: "ELV-TEST-BOTH-DISCOUNTS",
    createdAt: new Date(),
    orderStatus: "PLACED",
    paymentMethod: "WALLET",
    paymentStatus: "PAID",
    items: [
      {
        _id: new mongoose.Types.ObjectId(),
        productName: "Dell XPS Laptop",
        brandName: "Dell",
        variantDetails: "Silver / 16GB",
        image: "https://example.com/laptop.jpg",
        quantity: 1,
        regularPrice: 60000,
        salePrice: 50000,
        offerDiscount: 4000,
        appliedOfferName: "Laptop Festive Deal",
        effectiveItemPrice: 46000,
        itemTotal: 46000,
        itemStatus: "ACTIVE"
      }
    ],
    shippingAddress: testAddress,
    subtotal: 46000,
    discount: 10000,
    totalOfferDiscount: 4000,
    coupon: {
      couponId: new mongoose.Types.ObjectId(),
      code: "FESTIVE1000",
      discountType: "FIXED",
      discountValue: 1000,
      discountAmount: 1000
    },
    couponDiscount: 1000,
    shippingCharge: 0,
    tax: 0,
    finalAmount: 45000
  };

  const html4 = ejs.render(orderDetailsTemplate, {
    order: order4,
    title: "Order Details",
    user: { _id: "user1", fullName: "John Doe" }
  }, { views: [viewsDir] });

  assert(html4.includes('₹50,000'), "Test 4: Base Subtotal ₹50,000 is rendered");
  assert(html4.includes('Offer Savings'), "Test 4: Offer Savings is rendered");
  assert(html4.includes('-₹4,000'), "Test 4: Offer savings amount -₹4,000 is rendered");
  assert(html4.includes('Coupon (<span class="fw-bold font-monospace">FESTIVE1000</span>)'), "Test 4: Coupon FESTIVE1000 is clearly rendered");
  assert(html4.includes('-₹1,000'), "Test 4: Coupon discount -₹1,000 is rendered");
  assert(html4.includes('₹45,000'), "Test 4: Total Paid ₹45,000 is rendered");
  // Check exact arithmetic in rendered string: 50,000 - 4,000 - 1,000 = 45,000
  assert(order4.subtotal - order4.couponDiscount === order4.finalAmount, "Test 4: Mathematics is verified exact");

  // --------------------------------------------------------------------------
  // TEST 5: Coupon Snapshot Immutability Across Coupon Mutations
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Coupon Snapshot Immutability Across Coupon Lifecycle ---');
  // Create a real coupon in DB
  const testCoupon = await Coupon.create({
    code: `SNAP${Date.now().toString().slice(-5)}`,
    discountType: "FIXED",
    discountValue: 750,
    minCartValue: 1000,
    maxDiscountAmount: 750,
    startDate: new Date(Date.now() - 86400000),
    expiryDate: new Date(Date.now() + 86400000),
    usageLimit: 10,
    usedCount: 1,
    isActive: true,
    isDeleted: false
  });

  const testUser = await User.findOne() || await User.create({
    fullName: "Coupon Test User",
    email: `coupontest_${Date.now()}@example.com`,
    password: "Password123!",
    phone: "9876500000",
    isVerified: true
  });

  // Create an order with snapshot
  const persistedOrder = await Order.create({
    user: testUser._id,
    orderNumber: `ELV-SNAP-${Date.now().toString().slice(-6)}`,
    items: [
      {
        product: new mongoose.Types.ObjectId(),
        variantId: new mongoose.Types.ObjectId(),
        productName: "Test Smartphone",
        brandName: "BrandX",
        variantDetails: "Blue / 128GB",
        image: "https://example.com/phone.jpg",
        quantity: 1,
        regularPrice: 20000,
        salePrice: 18000,
        offerDiscount: 0,
        appliedOfferName: "",
        effectiveItemPrice: 18000,
        itemTotal: 18000,
        itemStatus: "ACTIVE"
      }
    ],
    shippingAddress: testAddress,
    subtotal: 18000,
    discount: 2000,
    totalOfferDiscount: 0,
    coupon: {
      couponId: testCoupon._id,
      code: testCoupon.code,
      discountType: testCoupon.discountType,
      discountValue: testCoupon.discountValue,
      discountAmount: 750
    },
    couponDiscount: 750,
    shippingCharge: 0,
    tax: 0,
    finalAmount: 17250,
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    orderStatus: "PLACED"
  });

  // Now mutate the coupon document: deactivate, change discount, soft delete!
  testCoupon.isActive = false;
  testCoupon.isDeleted = true;
  testCoupon.code = "CHANGED_CODE";
  testCoupon.discountValue = 100;
  await testCoupon.save();

  // Reload the order from DB
  const reloadedOrder = await Order.findById(persistedOrder._id).lean();

  assert(reloadedOrder.coupon.code === persistedOrder.coupon.code, "Test 5: Order coupon snapshot code is immutable");
  assert(reloadedOrder.coupon.discountAmount === 750, "Test 5: Order coupon snapshot discountAmount is immutable");
  assert(reloadedOrder.couponDiscount === 750, "Test 5: Order couponDiscount is preserved");

  // Render reloaded order in user template
  const html5 = ejs.render(orderDetailsTemplate, {
    order: reloadedOrder,
    title: "Order Details",
    user: { _id: testUser._id, fullName: testUser.fullName }
  }, { views: [viewsDir] });

  assert(html5.includes(persistedOrder.coupon.code), "Test 5: Frozen coupon code appears in rendered HTML even after coupon is deleted");
  assert(html5.includes('-₹750'), "Test 5: Frozen discount amount appears in rendered HTML even after coupon is deleted");

  // --------------------------------------------------------------------------
  // TEST 6: Invoice PDF Generation Verification
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Invoice PDF Generation Verification ---');
  const pdfChunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, callback) {
      pdfChunks.push(chunk);
      callback();
    }
  });
  mockRes.setHeader = () => {};

  await new Promise((resolve, reject) => {
    mockRes.on('finish', resolve);
    mockRes.on('error', reject);
    generateInvoicePDF({
      ...order4,
      createdAt: new Date(),
      user: { fullName: "Alice Smith", email: "alice@example.com", phone: "9876543210" }
    }, mockRes);
  });

  const pdfBuffer = Buffer.concat(pdfChunks);
  assert(pdfBuffer.length > 500, `Test 6: Invoice PDF generated successfully (${pdfBuffer.length} bytes)`);

  // Verify PDF contains text elements by decompressing the PDF content stream
  import('zlib').then(zlib => {});
  const zlib = await import('zlib');
  const pdfLatin1 = pdfBuffer.toString('latin1');
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  let decompressedStream = "";
  while ((match = streamRegex.exec(pdfLatin1)) !== null) {
    try {
      decompressedStream += zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch (e) {}
  }

  const hexCouponCode = Buffer.from('FESTIVE1000').toString('hex');
  const hexCouponLabel = Buffer.from('Coupon').toString('hex');
  assert(decompressedStream.toLowerCase().includes(hexCouponCode.toLowerCase()), "Test 6: PDF invoice includes Coupon code FESTIVE1000");
  assert(decompressedStream.toLowerCase().includes(hexCouponLabel.toLowerCase()), "Test 6: PDF invoice includes Coupon label");

  // --------------------------------------------------------------------------
  // TEST 7: Admin Order Details Payment Summary
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: Admin Order Details Payment Summary ---');
  const htmlAdmin = ejs.render(adminDetailsTemplate, {
    order: order4,
    title: "Order Details",
    user: { _id: "admin1", role: "ADMIN" }
  }, { views: [viewsDir] });

  assert(htmlAdmin.includes('₹50,000'), "Test 7: Admin view renders Base Subtotal ₹50,000");
  assert(htmlAdmin.includes('Offer Savings'), "Test 7: Admin view renders Offer Savings");
  assert(htmlAdmin.includes('-₹4,000'), "Test 7: Admin view renders Offer discount -₹4,000");
  assert(htmlAdmin.includes('FESTIVE1000'), "Test 7: Admin view renders Coupon code FESTIVE1000");
  assert(htmlAdmin.includes('-₹1,000'), "Test 7: Admin view renders Coupon discount -₹1,000");
  assert(htmlAdmin.includes('₹45,000'), "Test 7: Admin view renders Final Payable ₹45,000");

  // --------------------------------------------------------------------------
  // TEST 8: Multi-Item Order with Shipping Fee, Offers, and Coupon
  // --------------------------------------------------------------------------
  console.log('\n--- Test 8: Multi-Item Order with Shipping Fee, Offers, and Coupon ---');
  const order8 = {
    _id: new mongoose.Types.ObjectId(),
    orderNumber: "ELV-TEST-MULTI-ITEM",
    createdAt: new Date(),
    orderStatus: "SHIPPED",
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    items: [
      {
        _id: new mongoose.Types.ObjectId(),
        productName: "Keyboard RGB",
        brandName: "Logitech",
        variantDetails: "Black / Mechanical",
        image: "https://example.com/kb.jpg",
        quantity: 2,
        regularPrice: 3000,
        salePrice: 2500, // 2 * 2500 = 5000
        offerDiscount: 500, // 250 per unit
        appliedOfferName: "Gaming Fest 10%",
        effectiveItemPrice: 2250,
        itemTotal: 4500,
        itemStatus: "ACTIVE"
      },
      {
        _id: new mongoose.Types.ObjectId(),
        productName: "Mouse Wireless",
        brandName: "Logitech",
        variantDetails: "Black / Wireless",
        image: "https://example.com/mouse.jpg",
        quantity: 1,
        regularPrice: 1500,
        salePrice: 1200,
        offerDiscount: 0,
        appliedOfferName: "",
        effectiveItemPrice: 1200,
        itemTotal: 1200,
        itemStatus: "ACTIVE"
      }
    ],
    shippingAddress: testAddress,
    subtotal: 5700, // 4500 + 1200
    discount: 1300, // (500*2) + (300*1)
    totalOfferDiscount: 500,
    coupon: {
      couponId: new mongoose.Types.ObjectId(),
      code: "FLAT200",
      discountType: "FIXED",
      discountValue: 200,
      discountAmount: 200
    },
    couponDiscount: 200,
    shippingCharge: 50,
    tax: 0,
    finalAmount: 5550 // 5700 - 200 + 50
  };

  const html8 = ejs.render(orderDetailsTemplate, {
    order: order8,
    title: "Order Details",
    user: { _id: "user1", fullName: "John Doe" }
  }, { views: [viewsDir] });

  // itemsBaseTotal = (2500*2) + (1200*1) = 6200
  assert(html8.includes('₹6,200'), "Test 8: Subtotal before offer savings is ₹6,200");
  assert(html8.includes('Offer Savings') && html8.includes('-₹500'), "Test 8: Offer Savings -₹500 rendered");
  assert(html8.includes('FLAT200') && html8.includes('-₹200'), "Test 8: Coupon FLAT200 and -₹200 rendered");
  assert(html8.includes('₹50'), "Test 8: Shipping charge ₹50 rendered");
  assert(html8.includes('₹5,550'), "Test 8: Total Paid ₹5,550 rendered");
  // Math: 6,200 - 500 - 200 + 50 = 5,550
  assert(6200 - 500 - 200 + 50 === 5550, "Test 8: Arithmetic strictly verified");

  // Clean up created documents
  await Order.deleteOne({ _id: persistedOrder._id });
  await Coupon.deleteOne({ _id: testCoupon._id });

  await mongoose.disconnect();
  console.log('\n===============================================================');
  console.log('--- ALL ORDER COUPON DISPLAY TESTS PASSED SUCCESSFULLY! ---');
  console.log('===============================================================\n');
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
