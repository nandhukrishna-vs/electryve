import mongoose from "mongoose";
import * as dotenv from "dotenv";
dotenv.config();

import * as reportService from "../src/services/reportService.js";
import * as reportController from "../src/controllers/reportController.js";
import { generateSalesReportPdf } from "../src/utils/salesReportPdf.js";
import { generateSalesReportExcel } from "../src/utils/salesReportExcel.js";
import Order from "../src/models/Order.js";
import User from "../src/models/User.js";
import Product from "../src/models/Product.js";
import Category from "../src/models/Category.js";
import adminRoutes from "../src/routes/adminRoutes.js";
import fs from "fs";
import ExcelJS from "exceljs";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/electryve";

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    passedCount++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failedCount++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log("=================================================");
  console.log("   ELECTRYVE ADMIN SALES REPORT MODULE TEST SUITE");
  console.log("=================================================");

  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB successfully.\n");

    // ------------------------------------------------------------------------
    // TEST 1: reportService exports and functions
    // ------------------------------------------------------------------------
    console.log("TEST 1: Verifying reportService export signatures");
    assert(typeof reportService.normalizeDateRange === "function", "normalizeDateRange is exported");
    assert(typeof reportService.buildQualifyingOrderMatch === "function", "buildQualifyingOrderMatch is exported");
    assert(typeof reportService.getDashboardAnalytics === "function", "getDashboardAnalytics is exported");
    assert(typeof reportService.getSalesReportSummary === "function", "getSalesReportSummary is exported");
    assert(typeof reportService.getSalesReportGrouped === "function", "getSalesReportGrouped is exported");
    assert(typeof reportService.getSalesReportDetails === "function", "getSalesReportDetails is exported");
    assert(typeof reportService.getAllSalesReportOrders === "function", "getAllSalesReportOrders is exported");

    // ------------------------------------------------------------------------
    // TEST 2: Date presets & Aliases Normalization
    // ------------------------------------------------------------------------
    console.log("\nTEST 2: Verifying date presets and normalization in IST");
    const presets = ["today", "1_day", "yesterday", "this_week", "1_week", "this_month", "1_month", "last_month", "this_year"];
    for (const p of presets) {
      const res = reportService.normalizeDateRange({ preset: p });
      assert(res.startDate instanceof Date && !isNaN(res.startDate.getTime()), `Preset '${p}' generates valid startDate`);
      assert(res.endDate instanceof Date && !isNaN(res.endDate.getTime()), `Preset '${p}' generates valid endDate`);
      assert(res.startDate <= res.endDate, `Preset '${p}' startDate is <= endDate`);
    }

    const customRes = reportService.normalizeDateRange({ preset: "custom", startDate: "2026-09-01", endDate: "2026-09-20" });
    assert(customRes.startDateStr === "2026-09-01" && customRes.endDateStr === "2026-09-20", "Custom date range normalized correctly");

    let threwOnInvalidRange = false;
    try {
      reportService.normalizeDateRange({ preset: "custom", startDate: "2026-09-25", endDate: "2026-09-10" });
    } catch (e) {
      threwOnInvalidRange = true;
    }
    assert(threwOnInvalidRange, "normalizeDateRange throws on startDate > endDate");

    // ------------------------------------------------------------------------
    // TEST 3: Exact Consistency between Dashboard Analytics and Sales Report Summary
    // ------------------------------------------------------------------------
    console.log("\nTEST 3: Verifying exact financial consistency between Dashboard and Sales Report");
    const testPresets = ["this_month", "today", "this_year"];
    for (const p of testPresets) {
      const [dash, sales] = await Promise.all([
        reportService.getDashboardAnalytics({ preset: p }),
        reportService.getSalesReportSummary({ preset: p })
      ]);

      assert(dash.success === true && sales.success === true, `Both APIs succeed for preset '${p}'`);
      assert(dash.kpis.grossSales === sales.kpis.grossSales, `Preset '${p}': Gross Sales exact match (${dash.kpis.grossSales})`);
      assert(dash.kpis.completedRefunds === sales.kpis.completedRefunds, `Preset '${p}': Completed Refunds exact match (${dash.kpis.completedRefunds})`);
      assert(dash.kpis.netSales === sales.kpis.netSales, `Preset '${p}': Net Sales exact match (${dash.kpis.netSales})`);
      assert(dash.kpis.totalOrders === sales.kpis.totalOrders, `Preset '${p}': Total Orders exact match (${dash.kpis.totalOrders})`);
      assert(dash.kpis.unitsSold === sales.kpis.unitsSold, `Preset '${p}': Units Sold exact match (${dash.kpis.unitsSold})`);
      assert(dash.kpis.totalDiscounts === sales.kpis.totalDiscounts, `Preset '${p}': Total Discounts exact match (${dash.kpis.totalDiscounts})`);
      assert(dash.kpis.couponSavings === sales.kpis.couponSavings, `Preset '${p}': Coupon Savings exact match (${dash.kpis.couponSavings})`);
      assert(dash.kpis.offerSavings === sales.kpis.offerSavings, `Preset '${p}': Offer Savings exact match (${dash.kpis.offerSavings})`);
    }

    // ------------------------------------------------------------------------
    // TEST 4: Financial Invariants Verification
    // ------------------------------------------------------------------------
    console.log("\nTEST 4: Verifying core financial invariants");
    const summary = await reportService.getSalesReportSummary({ preset: "this_year" });
    const kpis = summary.kpis;

    const calculatedNet = Math.max(0, Math.round((kpis.grossSales - kpis.completedRefunds) * 100) / 100);
    assert(kpis.netSales === calculatedNet, `Net Sales invariant: netSales (${kpis.netSales}) === grossSales (${kpis.grossSales}) - completedRefunds (${kpis.completedRefunds})`);
    assert(kpis.totalDiscounts === Math.round((kpis.couponSavings + kpis.offerSavings) * 100) / 100, `Discounts invariant: totalDiscounts (${kpis.totalDiscounts}) === couponSavings (${kpis.couponSavings}) + offerSavings (${kpis.offerSavings})`);

    // ------------------------------------------------------------------------
    // TEST 5: Grouped Sales Periodic Aggregation Invariants
    // ------------------------------------------------------------------------
    console.log("\nTEST 5: Verifying grouped sales aggregation");
    const groupedDay = await reportService.getSalesReportGrouped({ preset: "this_month", groupBy: "day" });
    assert(groupedDay.success === true, "Grouped sales by day succeeds");
    assert(groupedDay.groupBy === "day", "Grouped sales resolved groupBy is 'day'");
    assert(Array.isArray(groupedDay.rows), "Grouped sales rows is an array");

    let sumGroupedGross = 0;
    let sumGroupedRefunds = 0;
    let sumGroupedOrders = 0;

    groupedDay.rows.forEach(row => {
      sumGroupedGross += row.grossSales;
      sumGroupedRefunds += row.completedRefunds;
      sumGroupedOrders += row.orderCount;
      const expectedNet = Math.max(0, Math.round((row.grossSales - row.completedRefunds) * 100) / 100);
      assert(row.netSales === expectedNet, `Row ${row.periodKey}: netSales (${row.netSales}) === grossSales - completedRefunds (${expectedNet})`);
    });

    const monthSummary = await reportService.getSalesReportSummary({ preset: "this_month" });
    assert(Math.round(sumGroupedGross * 100) / 100 === monthSummary.kpis.grossSales, `Grouped gross sales sum (${sumGroupedGross}) equals summary gross sales (${monthSummary.kpis.grossSales})`);
    assert(Math.round(sumGroupedRefunds * 100) / 100 === monthSummary.kpis.completedRefunds, `Grouped completed refunds sum (${sumGroupedRefunds}) equals summary completed refunds (${monthSummary.kpis.completedRefunds})`);
    assert(sumGroupedOrders === monthSummary.kpis.totalOrders, `Grouped order count sum (${sumGroupedOrders}) equals summary total orders (${monthSummary.kpis.totalOrders})`);

    const groupedMonth = await reportService.getSalesReportGrouped({ preset: "this_year", groupBy: "month" });
    assert(groupedMonth.success === true && groupedMonth.groupBy === "month", "Grouped sales by month succeeds");

    const groupedYear = await reportService.getSalesReportGrouped({ preset: "this_year", groupBy: "year" });
    assert(groupedYear.success === true && groupedYear.groupBy === "year", "Grouped sales by year succeeds");

    // ------------------------------------------------------------------------
    // TEST 6: Order Details and Server-Side Pagination
    // ------------------------------------------------------------------------
    console.log("\nTEST 6: Verifying order details and pagination");
    const detailsPage1 = await reportService.getSalesReportDetails({ preset: "this_year", page: 1, limit: 5 });
    assert(detailsPage1.success === true, "getSalesReportDetails succeeds");
    assert(Array.isArray(detailsPage1.orders), "details.orders is an array");
    assert(detailsPage1.orders.length <= 5, "details.orders length obeys limit of 5");
    assert(detailsPage1.pagination.page === 1, "Pagination page is 1");
    assert(detailsPage1.pagination.limit === 5, "Pagination limit is 5");

    if (detailsPage1.orders.length > 0) {
      const sampleOrder = detailsPage1.orders[0];
      assert(typeof sampleOrder.orderNumber === "string", "Order has orderNumber");
      assert(typeof sampleOrder.netSales === "number", "Order has netSales");
      assert(typeof sampleOrder.grossSales === "number", "Order has grossSales");
      assert(typeof sampleOrder.customerName === "string", "Order has customerName");
      assert(Array.isArray(sampleOrder.items), "Order has items array with historical snapshots");

      if (sampleOrder.items.length > 0) {
        const item = sampleOrder.items[0];
        assert(typeof item.productName === "string", "Item snapshot has productName");
        assert(typeof item.regularPrice === "number", "Item snapshot has regularPrice");
        assert(typeof item.salePrice === "number", "Item snapshot has salePrice");
      }
    }

    // ------------------------------------------------------------------------
    // TEST 7: Payment, Status, and Search Filters
    // ------------------------------------------------------------------------
    console.log("\nTEST 7: Verifying payment, status, and search filters");
    const codReport = await reportService.getSalesReportSummary({ preset: "this_year", paymentMethod: "COD" });
    assert(codReport.success === true, "Payment filter 'COD' succeeds");
    assert(codReport.filters.paymentMethod === "COD", "Payment filter recorded as 'COD'");

    const rpReport = await reportService.getSalesReportSummary({ preset: "this_year", paymentMethod: "RAZORPAY" });
    assert(rpReport.success === true, "Payment filter 'RAZORPAY' succeeds");

    const walletReport = await reportService.getSalesReportSummary({ preset: "this_year", paymentMethod: "WALLET" });
    assert(walletReport.success === true, "Payment filter 'WALLET' succeeds");

    const deliveredReport = await reportService.getSalesReportSummary({ preset: "this_year", orderStatus: "DELIVERED" });
    assert(deliveredReport.success === true, "Order status filter 'DELIVERED' succeeds");

    const searchReport = await reportService.getSalesReportDetails({ preset: "this_year", search: "ORD" });
    assert(searchReport.success === true, "Search filter query succeeds");

    // ------------------------------------------------------------------------
    // TEST 8: PDF Report Generation
    // ------------------------------------------------------------------------
    console.log("\nTEST 8: Verifying PDF generator");
    const exportData = await reportService.getAllSalesReportOrders({ preset: "this_month" });
    const pdfBuffer = await generateSalesReportPdf(exportData);
    assert(Buffer.isBuffer(pdfBuffer), "generateSalesReportPdf returns a Buffer");
    assert(pdfBuffer.length > 1000, `PDF buffer length is substantial (${pdfBuffer.length} bytes)`);
    const pdfHeader = pdfBuffer.slice(0, 4).toString("utf-8");
    assert(pdfHeader === "%PDF", "PDF buffer starts with %PDF magic header");

    // ------------------------------------------------------------------------
    // TEST 9: Excel Report Generation
    // ------------------------------------------------------------------------
    console.log("\nTEST 9: Verifying Excel generator");
    const excelBuffer = await generateSalesReportExcel(exportData);
    assert(Buffer.isBuffer(excelBuffer), "generateSalesReportExcel returns a Buffer");
    assert(excelBuffer.length > 1000, `Excel buffer length is substantial (${excelBuffer.length} bytes)`);
    const zipHeader = excelBuffer.slice(0, 2).toString("utf-8");
    assert(zipHeader === "PK", "Excel buffer starts with PK zip magic header");

    // Inspect generated Excel workbook structure
    const testWorkbook = new ExcelJS.Workbook();
    await testWorkbook.xlsx.load(excelBuffer);
    const sheetNames = testWorkbook.worksheets.map(ws => ws.name);
    assert(sheetNames.includes("Summary"), "Excel workbook contains 'Summary' sheet");
    assert(sheetNames.includes("Grouped Sales"), "Excel workbook contains 'Grouped Sales' sheet");
    assert(sheetNames.includes("Detailed Orders"), "Excel workbook contains 'Detailed Orders' sheet");
    assert(sheetNames.includes("Item Breakdown"), "Excel workbook contains 'Item Breakdown' sheet");

    // ------------------------------------------------------------------------
    // TEST 10: reportController and Route Handlers
    // ------------------------------------------------------------------------
    console.log("\nTEST 10: Verifying reportController and Route Handlers");
    assert(typeof reportController.loadSalesReport === "function", "loadSalesReport is exported");
    assert(typeof reportController.getSalesReportData === "function", "getSalesReportData is exported");
    assert(typeof reportController.exportSalesReportPdf === "function", "exportSalesReportPdf is exported");
    assert(typeof reportController.exportSalesReportExcel === "function", "exportSalesReportExcel is exported");

    // Test controller getSalesReportData with mock req, res
    let responseData = null;
    let statusCode = 200;
    const mockReq = {
      query: { preset: "this_month" }
    };
    const mockRes = {
      status(code) { statusCode = code; return this; },
      json(payload) { responseData = payload; return this; }
    };
    await reportController.getSalesReportData(mockReq, mockRes);
    assert(statusCode === 200, "getSalesReportData responds with 200");
    assert(responseData && responseData.success === true, "getSalesReportData payload has success: true");
    assert(responseData.summary && responseData.grouped && responseData.details, "getSalesReportData payload contains summary, grouped, and details");

    // ------------------------------------------------------------------------
    // TEST 11: Route definitions and Admin Layout Sidebar
    // ------------------------------------------------------------------------
    console.log("\nTEST 11: Verifying admin routes and layout sidebar");
    const adminRoutesFile = fs.readFileSync("src/routes/adminRoutes.js", "utf-8");
    assert(adminRoutesFile.includes('/sales-report"'), "adminRoutes.js contains /sales-report route");
    assert(adminRoutesFile.includes('/sales-report/data"'), "adminRoutes.js contains /sales-report/data route");
    assert(adminRoutesFile.includes('/sales-report/pdf"'), "adminRoutes.js contains /sales-report/pdf route");
    assert(adminRoutesFile.includes('/sales-report/excel"'), "adminRoutes.js contains /sales-report/excel route");

    const adminLayoutFile = fs.readFileSync("src/views/layouts/admin-layout.ejs", "utf-8");
    assert(adminLayoutFile.includes('href="/admin/sales-report"'), "admin-layout.ejs contains Sales Report navigation link");
    assert(adminLayoutFile.includes("Sales Report"), "admin-layout.ejs displays 'Sales Report' link text");

    const salesReportViewFile = fs.readFileSync("src/views/admin/sales-report.ejs", "utf-8");
    assert(salesReportViewFile.includes('id="sales-report-view"'), "sales-report.ejs has main sales-report-view container");
    assert(salesReportViewFile.includes('id="btn-export-pdf"'), "sales-report.ejs has PDF export button");
    assert(salesReportViewFile.includes('id="btn-export-excel"'), "sales-report.ejs has Excel export button");
    assert(salesReportViewFile.includes('id="kpi-net-sales"'), "sales-report.ejs has Net Sales KPI card");
    assert(salesReportViewFile.includes('id="grouped-sales-table"'), "sales-report.ejs has grouped sales table");
    assert(salesReportViewFile.includes('id="detailed-orders-table"'), "sales-report.ejs has detailed orders table");

    console.log("\n=================================================");
    console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log("=================================================");

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("FATAL TEST ERROR:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

runTests();
