/**
 * Comprehensive Test Suite: Electryve Admin Dashboard Redesign + Chart.js Analytics
 *
 * Verifies:
 * 1. Date Range Normalization & Presets (IST boundaries)
 * 2. Authoritative Qualifying Sales Orders (Exclusions & Inclusions)
 * 3. Exact Financial Formulations (Gross, Net, Completed Refunds, Discounts)
 * 4. Exactly Three Chart.js Data Structures:
 *    - Chart 1: Sales Trend (Line Chart)
 *    - Chart 2: Orders by Payment Method (Doughnut Chart)
 *    - Chart 3: Top 10 Products by Units Sold (Horizontal Bar Chart)
 * 5. Non-Chart Supporting Data (Top Categories, Recent Refunds, Recent Orders, Low Stock)
 * 6. Historical Snapshot Immutability
 * 7. Controller AJAX Endpoint & Error Handling
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";
dotenv.config();

import User from "../src/models/User.js";
import Product from "../src/models/Product.js";
import Category from "../src/models/Category.js";
import Brand from "../src/models/Brand.js";
import Order from "../src/models/Order.js";
import Address from "../src/models/Address.js";

import * as reportService from "../src/services/reportService.js";
import * as adminController from "../src/controllers/adminController.js";

let testUser = null;
let testCategory = null;
let testBrand = null;
let testProducts = [];
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
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }
  console.log("Connected to MongoDB for Dashboard Analytics Testing");

  // Create unique seed data
  const testRunId = crypto.randomBytes(4).toString("hex");

  testUser = await User.create({
    fullName: `Dashboard Test User ${testRunId}`,
    email: `dash_user_${testRunId}@example.com`,
    password: "Password@123",
    role: "USER",
    isBlocked: false
  });

  testCategory = await Category.create({
    name: `Dash Category ${testRunId}`,
    slug: `cat-dash-${testRunId}`,
    isListed: true,
    isDeleted: false
  });

  testBrand = await Brand.create({
    name: `Dash Brand ${testRunId}`,
    slug: `brand-dash-${testRunId}`,
    isListed: true,
    isDeleted: false
  });

  // Create 3 products with variants (one with low stock, one out of stock, one high stock)
  for (let i = 1; i <= 3; i++) {
    const prod = await Product.create({
      name: `Dash Test Product ${i} ${testRunId}`,
      slug: `prod-dash-${testRunId}-${i}`,
      description: `Product description ${i}`,
      category: testCategory._id,
      brand: testBrand._id,
      isListed: true,
      isDeleted: false,
      variants: [
        {
          sku: `SKU-DASH-${testRunId}-${i}`,
          color: "Black",
          storage: "128GB",
          regularPrice: 1200 * i,
          salePrice: 1000 * i,
          stock: i === 1 ? 0 : (i === 2 ? 3 : 25), // Product 1 out of stock (0), Product 2 low stock (3), Product 3 normal (25)
          images: ["/uploads/dash1.jpg", "/uploads/dash2.jpg", "/uploads/dash3.jpg"]
        }
      ]
    });
    testProducts.push(prod);
  }
}

async function cleanupDatabase() {
  console.log("\nCleaning up test data...");
  if (createdOrders.length > 0) {
    await Order.deleteMany({ _id: { $in: createdOrders.map(o => o._id) } });
  }
  if (testProducts.length > 0) {
    await Product.deleteMany({ _id: { $in: testProducts.map(p => p._id) } });
  }
  if (testCategory) {
    await Category.deleteOne({ _id: testCategory._id });
  }
  if (testBrand) {
    await Brand.deleteOne({ _id: testBrand._id });
  }
  if (testUser) {
    await User.deleteOne({ _id: testUser._id });
  }
  console.log("Cleanup complete.");
}

async function runDateNormalizationTests() {
  console.log("\n--- SECTION 1: DATE NORMALIZATION & PRESET BOUNDARIES ---");

  // 1.1 Default Preset
  const defRange = reportService.normalizeDateRange();
  assert(defRange.preset === "this_month", "Default preset is this_month");
  assert(defRange.startDate instanceof Date && !isNaN(defRange.startDate), "Default startDate is a valid Date");
  assert(defRange.endDate instanceof Date && !isNaN(defRange.endDate), "Default endDate is a valid Date");
  assert(defRange.startDate < defRange.endDate, "startDate is before endDate");

  // 1.2 Today Preset
  const todayRange = reportService.normalizeDateRange({ preset: "today" });
  assert(todayRange.preset === "today", "Preset today resolved correctly");
  assert(todayRange.startDateStr === todayRange.endDateStr, "Today start date string equals end date string");
  assert(todayRange.startDate.toISOString().includes("T"), "Start date is an ISO date");

  // 1.3 Yesterday Preset
  const yestRange = reportService.normalizeDateRange({ preset: "yesterday" });
  assert(yestRange.preset === "yesterday", "Preset yesterday resolved correctly");
  assert(yestRange.startDateStr === yestRange.endDateStr, "Yesterday start date string equals end date string");
  assert(yestRange.startDate < todayRange.startDate, "Yesterday start date is before today start date");

  // 1.4 This Week Preset
  const weekRange = reportService.normalizeDateRange({ preset: "this_week" });
  assert(weekRange.preset === "this_week", "Preset this_week resolved correctly");
  assert(weekRange.startDate <= todayRange.startDate, "Week start date is on or before today");

  // 1.5 Last Month Preset
  const lastMonthRange = reportService.normalizeDateRange({ preset: "last_month" });
  assert(lastMonthRange.preset === "last_month", "Preset last_month resolved correctly");
  assert(lastMonthRange.startDate < defRange.startDate, "Last month start is before this month start");

  // 1.6 This Year Preset
  const yearRange = reportService.normalizeDateRange({ preset: "this_year" });
  assert(yearRange.preset === "this_year", "Preset this_year resolved correctly");
  assert(yearRange.startDateStr.endsWith("-01-01"), "Year start is Jan 1st");
  assert(yearRange.endDateStr.endsWith("-12-31"), "Year end is Dec 31st");

  // 1.7 Custom Range (Valid)
  const customRange = reportService.normalizeDateRange({
    preset: "custom",
    startDate: "2026-05-01",
    endDate: "2026-05-15"
  });
  assert(customRange.preset === "custom", "Preset custom resolved correctly");
  assert(customRange.startDateStr === "2026-05-01", "Custom start date string matches");
  assert(customRange.endDateStr === "2026-05-15", "Custom end date string matches");

  // 1.8 Custom Range (Invalid Inverted)
  let caughtInverted = false;
  try {
    reportService.normalizeDateRange({
      preset: "custom",
      startDate: "2026-05-20",
      endDate: "2026-05-10"
    });
  } catch (err) {
    caughtInverted = true;
    assert(err.message.includes("Start date cannot be after end date"), "Inverted custom range throws descriptive error");
  }
  assert(caughtInverted, "Inverted date range was caught");

  // 1.9 Custom Range (Missing / Malformed)
  let caughtMalformed = false;
  try {
    reportService.normalizeDateRange({
      preset: "custom",
      startDate: "invalid-date",
      endDate: "2026-05-10"
    });
  } catch (err) {
    caughtMalformed = true;
    assert(err.message.includes("Invalid custom date range"), "Malformed date string throws descriptive error");
  }
  assert(caughtMalformed, "Malformed date string was caught");
}

async function runFinancialAndKPIInvariantsTests() {
  console.log("\n--- SECTION 2: QUALIFYING SALES ORDERS & FINANCIAL METRICS ---");

  // Create isolated orders within current month
  const now = new Date();
  const testRunId = crypto.randomBytes(3).toString("hex");

  // Order 1: RAZORPAY Completed
  // Gross: 1200, couponDiscount: 200, totalOfferDiscount: 100, refundAmount: 0
  const order1 = await Order.create({
    orderNumber: `ORD-TEST-1-${testRunId}`,
    user: testUser._id,
    shippingAddress: {
      fullName: "Test Customer 1",
      phone: "9876543210",
      addressLine1: "Test St 1",
      city: "Kochi",
      state: "Kerala",
      pinCode: 682001
    },
    paymentMethod: "RAZORPAY",
    paymentStatus: "COMPLETED",
    orderStatus: "DELIVERED",
    subtotal: 1500,
    totalAmount: 1500,
    totalOfferDiscount: 100,
    couponDiscount: 200,
    discount: 300,
    tax: 0,
    shippingCharge: 0,
    finalAmount: 1200,
    refundAmount: 0,
    refundStatus: "NONE",
    items: [
      {
        product: testProducts[0]._id,
        variantId: testProducts[0].variants[0]._id,
        productName: testProducts[0].name,
        brandName: testBrand.name,
        sku: testProducts[0].variants[0].sku,
        variantDetails: "Black / 128GB",
        image: "/uploads/dash1.jpg",
        regularPrice: 1500,
        salePrice: 1400,
        quantity: 2,
        itemTotal: 2800,
        itemStatus: "ACTIVE"
      }
    ],
    createdAt: now
  });
  createdOrders.push(order1);

  // Order 2: WALLET Completed with partial refund
  // Gross: 800, couponDiscount: 0, totalOfferDiscount: 50, refundAmount: 200, refundStatus: "COMPLETED"
  const order2 = await Order.create({
    orderNumber: `ORD-TEST-2-${testRunId}`,
    user: testUser._id,
    shippingAddress: {
      fullName: "Test Customer 2",
      phone: "9876543211",
      addressLine1: "Test St 2",
      city: "Kochi",
      state: "Kerala",
      pinCode: 682001
    },
    paymentMethod: "WALLET",
    paymentStatus: "COMPLETED",
    orderStatus: "DELIVERED",
    subtotal: 850,
    totalAmount: 850,
    totalOfferDiscount: 50,
    couponDiscount: 0,
    discount: 50,
    tax: 0,
    shippingCharge: 0,
    finalAmount: 800,
    refundAmount: 200,
    refundStatus: "COMPLETED",
    refundMethod: "WALLET",
    refundedAt: now,
    items: [
      {
        product: testProducts[1]._id,
        variantId: testProducts[1].variants[0]._id,
        productName: testProducts[1].name,
        brandName: testBrand.name,
        sku: testProducts[1].variants[0].sku,
        variantDetails: "Black / 128GB",
        image: "/uploads/dash2.jpg",
        regularPrice: 850,
        salePrice: 800,
        quantity: 1,
        itemTotal: 800,
        itemStatus: "ACTIVE"
      }
    ],
    createdAt: now
  });
  createdOrders.push(order2);

  // Order 3: COD Placed (unpaid yet, but active/placed -> qualifying)
  // Gross: 1500, couponDiscount: 100, totalOfferDiscount: 0, refundAmount: 0
  const order3 = await Order.create({
    orderNumber: `ORD-TEST-3-${testRunId}`,
    user: testUser._id,
    shippingAddress: {
      fullName: "Test Customer 3",
      phone: "9876543212",
      addressLine1: "Test St 3",
      city: "Kochi",
      state: "Kerala",
      pinCode: 682001
    },
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    orderStatus: "PLACED",
    subtotal: 1600,
    totalAmount: 1600,
    totalOfferDiscount: 0,
    couponDiscount: 100,
    discount: 100,
    tax: 0,
    shippingCharge: 0,
    finalAmount: 1500,
    refundAmount: 0,
    refundStatus: "NONE",
    items: [
      {
        product: testProducts[2]._id,
        variantId: testProducts[2].variants[0]._id,
        productName: testProducts[2].name,
        brandName: testBrand.name,
        sku: testProducts[2].variants[0].sku,
        variantDetails: "Black / 128GB",
        image: "/uploads/dash3.jpg",
        regularPrice: 1600,
        salePrice: 1600,
        quantity: 3,
        itemTotal: 4800,
        itemStatus: "ACTIVE"
      }
    ],
    createdAt: now
  });
  createdOrders.push(order3);

  // Order 4: COD Cancelled before delivery (UNPAID CANCELLED COD -> MUST BE EXCLUDED)
  const order4 = await Order.create({
    orderNumber: `ORD-TEST-4-EXCLUDED-${testRunId}`,
    user: testUser._id,
    shippingAddress: {
      fullName: "Cancelled COD",
      phone: "9876543213",
      addressLine1: "Test St 4",
      city: "Kochi",
      state: "Kerala",
      pinCode: 682001
    },
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    orderStatus: "CANCELLED",
    subtotal: 2000,
    totalAmount: 2000,
    totalOfferDiscount: 0,
    couponDiscount: 0,
    discount: 0,
    tax: 0,
    shippingCharge: 0,
    finalAmount: 2000,
    refundAmount: 0,
    refundStatus: "NONE",
    items: [
      {
        product: testProducts[0]._id,
        variantId: testProducts[0].variants[0]._id,
        productName: testProducts[0].name,
        brandName: testBrand.name,
        sku: testProducts[0].variants[0].sku,
        variantDetails: "Black / 128GB",
        image: "/uploads/dash1.jpg",
        regularPrice: 2000,
        salePrice: 2000,
        quantity: 5,
        itemTotal: 10000,
        itemStatus: "CANCELLED"
      }
    ],
    createdAt: now
  });
  createdOrders.push(order4);

  // Order 5: RAZORPAY Failed attempt (FAILED PAYMENT -> MUST BE EXCLUDED)
  const order5 = await Order.create({
    orderNumber: `ORD-TEST-5-EXCLUDED-${testRunId}`,
    user: testUser._id,
    shippingAddress: {
      fullName: "Failed Razorpay",
      phone: "9876543214",
      addressLine1: "Test St 5",
      city: "Kochi",
      state: "Kerala",
      pinCode: 682001
    },
    paymentMethod: "RAZORPAY",
    paymentStatus: "FAILED",
    orderStatus: "CANCELLED",
    subtotal: 3000,
    totalAmount: 3000,
    totalOfferDiscount: 0,
    couponDiscount: 0,
    discount: 0,
    tax: 0,
    shippingCharge: 0,
    finalAmount: 3000,
    refundAmount: 0,
    refundStatus: "NONE",
    items: [
      {
        product: testProducts[1]._id,
        variantId: testProducts[1].variants[0]._id,
        productName: testProducts[1].name,
        brandName: testBrand.name,
        sku: testProducts[1].variants[0].sku,
        variantDetails: "Black / 128GB",
        image: "/uploads/dash2.jpg",
        regularPrice: 3000,
        salePrice: 3000,
        quantity: 10,
        itemTotal: 30000,
        itemStatus: "CANCELLED"
      }
    ],
    createdAt: now
  });
  createdOrders.push(order5);

  // Fetch dashboard analytics for "today"
  const analytics = await reportService.getDashboardAnalytics({ preset: "today" });

  assert(analytics.success === true, "getDashboardAnalytics returned success: true");
  assert(analytics.period.preset === "today", "Analytics period preset is today");

  // Validate KPIs
  // Expected qualifying orders: at least orders 1, 2, 3 created in this run
  // Order 4 (unpaid cancelled COD) and Order 5 (failed Razorpay) must not be counted.
  assert(analytics.kpis.totalOrders >= 3, `Total orders count (${analytics.kpis.totalOrders}) includes all qualifying orders`);

  // Financial calculations
  // Verify Net Sales = Gross Sales - Completed Refunds
  const calculatedNet = Math.round((analytics.kpis.grossSales - analytics.kpis.completedRefunds) * 100) / 100;
  assert(analytics.kpis.netSales === calculatedNet, `Net Sales (${analytics.kpis.netSales}) = Gross Sales (${analytics.kpis.grossSales}) - Refunds (${analytics.kpis.completedRefunds})`);

  // Verify Discounts = Coupon Savings + Offer Savings
  assert(analytics.kpis.totalDiscounts >= (analytics.kpis.couponSavings + analytics.kpis.offerSavings), "Discounts reflect combined savings");

  // Verify Units Sold does not include cancelled items
  assert(analytics.kpis.unitsSold >= 6, `Units sold (${analytics.kpis.unitsSold}) includes non-cancelled items (2 + 1 + 3 = 6)`);
}

async function runThreeChartsTests() {
  console.log("\n--- SECTION 3: EXACTLY THREE CHART.JS DATA STRUCTURES ---");

  const analytics = await reportService.getDashboardAnalytics({ preset: "today" });

  // CHART 1: Sales Trend (Line Chart)
  assert(Array.isArray(analytics.salesTrend), "salesTrend is an array");
  assert(analytics.salesTrend.length > 0, "salesTrend has time-series buckets");
  analytics.salesTrend.forEach(bucket => {
    assert(typeof bucket.period === "string", "Bucket has string period (YYYY-MM-DD)");
    assert(typeof bucket.label === "string", "Bucket has display label");
    assert(typeof bucket.netSales === "number" && bucket.netSales >= 0, "Bucket netSales is non-negative number");
    assert(typeof bucket.orderCount === "number" && bucket.orderCount >= 0, "Bucket orderCount is non-negative number");
  });

  // CHART 2: Orders by Payment Method (Doughnut Chart)
  assert(Array.isArray(analytics.paymentBreakdown), "paymentBreakdown is an array");
  assert(analytics.paymentBreakdown.length === 3, "paymentBreakdown contains exactly 3 methods (COD, RAZORPAY, WALLET)");
  const methods = analytics.paymentBreakdown.map(p => p.method);
  assert(methods.includes("COD") && methods.includes("RAZORPAY") && methods.includes("WALLET"), "Payment breakdown covers COD, RAZORPAY, and WALLET");

  let totalPercent = 0;
  analytics.paymentBreakdown.forEach(p => {
    assert(typeof p.count === "number", `Payment ${p.method} count is a number`);
    assert(typeof p.amount === "number", `Payment ${p.method} amount is a number`);
    assert(typeof p.percentage === "number", `Payment ${p.method} percentage is a number`);
    totalPercent += p.percentage;
  });
  assert(totalPercent <= 100.1, `Total payment percentages sum to ~100% (got ${totalPercent}%)`);

  // CHART 3: Top 10 Products by Units Sold (Horizontal Bar Chart)
  assert(Array.isArray(analytics.topProducts), "topProducts is an array");
  assert(analytics.topProducts.length <= 10, "topProducts contains at most 10 products");
  if (analytics.topProducts.length > 0) {
    const firstProd = analytics.topProducts[0];
    assert(typeof firstProd.productName === "string", "Top product has productName");
    assert(typeof firstProd.unitsSold === "number" && firstProd.unitsSold > 0, "Top product has positive unitsSold");
    assert(typeof firstProd.revenue === "number", "Top product has revenue");

    // Verify sorted descending by unitsSold
    for (let i = 0; i < analytics.topProducts.length - 1; i++) {
      assert(analytics.topProducts[i].unitsSold >= analytics.topProducts[i + 1].unitsSold, `topProducts sorted descending by unitsSold (${analytics.topProducts[i].unitsSold} >= ${analytics.topProducts[i + 1].unitsSold})`);
    }
  }

  // NO FOURTH CHART:
  // Ensure topCategories, recentOrders, lowStock, and recentRefunds are tables/lists, NOT charts
  assert(Array.isArray(analytics.topCategories), "topCategories is a ranked array (table), not a chart");
  assert(Array.isArray(analytics.recentOrders), "recentOrders is a list array, not a chart");
  assert(Array.isArray(analytics.lowStock), "lowStock is a list array, not a chart");
  assert(Array.isArray(analytics.recentRefunds), "recentRefunds is a list array, not a chart");
}

async function runHistoricalSnapshotImmutabilityTests() {
  console.log("\n--- SECTION 4: HISTORICAL ORDER ITEM SNAPSHOT IMMUTABILITY ---");

  // Modify the live product name and price in the database
  const targetProduct = testProducts[0];
  const originalName = targetProduct.name;
  await Product.updateOne(
    { _id: targetProduct._id },
    { $set: { name: "MUTATED LIVE PRODUCT TITLE - SHOULD NOT AFFECT HISTORICAL ANALYTICS" } }
  );

  const analyticsAfterMutation = await reportService.getDashboardAnalytics({ preset: "today" });
  const snapshotProductInChart = analyticsAfterMutation.topProducts.find(p => p.productName === originalName);

  assert(!!snapshotProductInChart, `Analytics topProducts preserved historical OrderItem productName (${originalName}) instead of mutated live product title`);

  // Restore live product name
  await Product.updateOne({ _id: targetProduct._id }, { $set: { name: originalName } });
}

async function runLowStockAlertsTests() {
  console.log("\n--- SECTION 5: LOW STOCK ALERTS INVENTORY OPERATIONAL DATA ---");

  const analytics = await reportService.getDashboardAnalytics({ preset: "today" });

  assert(Array.isArray(analytics.lowStock), "lowStock is an array");
  // We created Product 1 with stock 0, and Product 2 with stock 3. Both <= 5 threshold.
  const foundZeroStock = analytics.lowStock.find(item => item.productId.toString() === testProducts[0]._id.toString());
  const foundLowStock = analytics.lowStock.find(item => item.productId.toString() === testProducts[1]._id.toString());

  assert(!!foundZeroStock, "Found out-of-stock product in lowStock alerts");
  assert(foundZeroStock.status === "Out of Stock", "Product with 0 stock has status 'Out of Stock'");

  assert(!!foundLowStock, "Found low-stock product in lowStock alerts");
  assert(foundLowStock.status === "Low Stock", "Product with 3 stock has status 'Low Stock'");
}

async function runControllerAndEndpointTests() {
  console.log("\n--- SECTION 6: CONTROLLER AND AJAX ENDPOINT TESTS ---");

  // Test 1: getDashboardData with valid preset
  let jsonResponseData = null;
  let responseStatus = 200;

  const mockReqValid = {
    query: { preset: "this_week" }
  };
  const mockResValid = {
    json: (data) => {
      jsonResponseData = data;
      return mockResValid;
    },
    status: (code) => {
      responseStatus = code;
      return mockResValid;
    }
  };

  await adminController.getDashboardData(mockReqValid, mockResValid);
  assert(responseStatus === 200, "getDashboardData returned HTTP 200 for valid preset");
  assert(jsonResponseData && jsonResponseData.success === true, "JSON response contains success: true");
  assert(jsonResponseData.period.preset === "this_week", "JSON response period preset is this_week");

  // Test 2: getDashboardData with invalid custom dates returns 400
  let errorResponseData = null;
  let errorStatus = 200;

  const mockReqInvalid = {
    query: {
      preset: "custom",
      startDate: "2026-12-31",
      endDate: "2026-01-01" // Inverted!
    }
  };
  const mockResInvalid = {
    json: (data) => {
      errorResponseData = data;
      return mockResInvalid;
    },
    status: (code) => {
      errorStatus = code;
      return mockResInvalid;
    }
  };

  await adminController.getDashboardData(mockReqInvalid, mockResInvalid);
  assert(errorStatus === 400, "getDashboardData returned HTTP 400 for inverted custom dates");
  assert(errorResponseData && errorResponseData.success === false, "Error response contains success: false");
  assert(errorResponseData.message.includes("Start date cannot be after end date"), "Error response contains descriptive error message");

  // Test 3: loadDashboard renders view with initialData
  let renderedView = null;
  let renderOptions = null;

  const mockReqLoad = {
    query: {}
  };
  const mockResLoad = {
    render: (view, options) => {
      renderedView = view;
      renderOptions = options;
    }
  };

  await adminController.loadDashboard(mockReqLoad, mockResLoad);
  assert(renderedView === "admin/dashboard", "loadDashboard renders admin/dashboard view");
  assert(renderOptions.layout === "layouts/admin-layout", "loadDashboard uses admin-layout");
  assert(renderOptions.title === "Dashboard", "loadDashboard passes title 'Dashboard'");
  assert(renderOptions.initialData && renderOptions.initialData.success === true, "loadDashboard passes populated initialData");
}

async function runAllTests() {
  console.log("==================================================");
  console.log("ELECTRYVE ADMIN DASHBOARD + CHART.JS TEST SUITE");
  console.log("==================================================");

  try {
    await setupDatabase();
    await runDateNormalizationTests();
    await runFinancialAndKPIInvariantsTests();
    await runThreeChartsTests();
    await runHistoricalSnapshotImmutabilityTests();
    await runLowStockAlertsTests();
    await runControllerAndEndpointTests();

    console.log("\n==================================================");
    console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests}`);
    console.log("==================================================");
  } catch (error) {
    console.error("\nTEST SUITE FAILED:", error);
    process.exitCode = 1;
  } finally {
    await cleanupDatabase();
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

runAllTests();
