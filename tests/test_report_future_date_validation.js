import mongoose from "mongoose";
import * as dotenv from "dotenv";
dotenv.config();

import * as reportService from "../src/services/reportService.js";
import * as reportController from "../src/controllers/reportController.js";

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
  console.log("=== SALES REPORT FUTURE-DATE & BOUNDARY VALIDATION TESTS ===");
  await mongoose.connect(MONGO_URI);

  const todayStr = reportService.getTodayIST();
  console.log(`Current IST Date: ${todayStr}`);

  // Test 1: Today to Today is valid
  console.log("\n1. Testing Valid Boundary Ranges");
  const todayRange = reportService.normalizeDateRange({ preset: "custom", startDate: todayStr, endDate: todayStr });
  assert(todayRange.startDateStr === todayStr, "start === end === todayStr succeeds");
  assert(todayRange.endDateStr === todayStr, "endDateStr is todayStr");

  // Test 2: Yesterday to Today is valid
  const [y, m, d] = todayStr.split("-").map(Number);
  const yestDate = new Date(Date.UTC(y, m - 1, d - 1));
  const pad = (n) => String(n).padStart(2, "0");
  const yestStr = `${yestDate.getUTCFullYear()}-${pad(yestDate.getUTCMonth() + 1)}-${pad(yestDate.getUTCDate())}`;
  const validRange = reportService.normalizeDateRange({ preset: "custom", startDate: yestStr, endDate: todayStr });
  assert(validRange.startDateStr === yestStr && validRange.endDateStr === todayStr, "yesterday to today succeeds");

  // Test 3: Future Start Date rejected
  console.log("\n2. Testing Future Date Rejection");
  const futDate = new Date(Date.UTC(y, m - 1, d + 5));
  const futStr = `${futDate.getUTCFullYear()}-${pad(futDate.getUTCMonth() + 1)}-${pad(futDate.getUTCDate())}`;
  let threwFutureStart = false;
  try {
    reportService.normalizeDateRange({ preset: "custom", startDate: futStr, endDate: futStr });
  } catch (err) {
    threwFutureStart = true;
    assert(err.message.includes("Future dates are not permitted"), `Correct error message for future start: "${err.message}"`);
  }
  assert(threwFutureStart, "Future start date is rejected");

  // Test 4: Future End Date rejected
  let threwFutureEnd = false;
  try {
    reportService.normalizeDateRange({ preset: "custom", startDate: todayStr, endDate: futStr });
  } catch (err) {
    threwFutureEnd = true;
    assert(err.message.includes("Future dates are not permitted"), `Correct error message for future end: "${err.message}"`);
  }
  assert(threwFutureEnd, "Future end date is rejected");

  // Test 5: Start > End rejected
  console.log("\n3. Testing Inverted and Malformed Date Rejection");
  let threwStartAfterEnd = false;
  try {
    reportService.normalizeDateRange({ preset: "custom", startDate: todayStr, endDate: yestStr });
  } catch (err) {
    threwStartAfterEnd = true;
    assert(err.message.includes("Start date cannot be after end date"), `Correct message for start > end: "${err.message}"`);
  }
  assert(threwStartAfterEnd, "Start date after end date is rejected");

  // Test 6: Missing dates rejected
  let threwMissingDates = false;
  try {
    reportService.normalizeDateRange({ preset: "custom", startDate: "", endDate: todayStr });
  } catch (err) {
    threwMissingDates = true;
  }
  assert(threwMissingDates, "Missing start date is rejected");

  // Test 7: Impossible calendar dates rejected (e.g. Feb 31)
  let threwImpossibleDate = false;
  try {
    reportService.normalizeDateRange({ preset: "custom", startDate: "2026-02-31", endDate: "2026-02-31" });
  } catch (err) {
    threwImpossibleDate = true;
    assert(err.message.includes("Invalid calendar date"), `Impossible calendar date error: "${err.message}"`);
  }
  assert(threwImpossibleDate, "Impossible calendar date (Feb 31) is rejected");

  // Test 8: Non-existent month 13 rejected
  let threwBadMonth = false;
  try {
    reportService.normalizeDateRange({ preset: "custom", startDate: "2026-13-01", endDate: "2026-13-10" });
  } catch (err) {
    threwBadMonth = true;
  }
  assert(threwBadMonth, "Month 13 is rejected");

  // Test 9: Controller getSalesReportData returns HTTP 400 for future date
  console.log("\n4. Testing Controller API HTTP 400 Responses");
  const mockReq = {
    query: {
      preset: "custom",
      startDate: futStr,
      endDate: futStr
    }
  };
  let responseStatus = null;
  let responseJson = null;
  const mockRes = {
    status: (code) => {
      responseStatus = code;
      return {
        json: (data) => {
          responseJson = data;
        }
      };
    }
  };

  await reportController.getSalesReportData(mockReq, mockRes);
  assert(responseStatus === 400, `Future date query returns HTTP 400 (got ${responseStatus})`);
  assert(responseJson && responseJson.success === false, "Returns success: false");
  assert(responseJson && responseJson.message.includes("Future dates are not permitted"), "Returns clear future date error message");

  // Test 10: PDF and Excel export return HTTP 400 on future date
  let pdfStatus = null;
  let pdfJson = null;
  const mockPdfRes = {
    status: (code) => {
      pdfStatus = code;
      return { json: (d) => { pdfJson = d; } };
    },
    setHeader: () => {},
    send: () => {}
  };
  await reportController.exportSalesReportPdf(mockReq, mockPdfRes);
  assert(pdfStatus === 400, `PDF export with future date returns HTTP 400 (got ${pdfStatus})`);

  let excelStatus = null;
  let excelJson = null;
  const mockExcelRes = {
    status: (code) => {
      excelStatus = code;
      return { json: (d) => { excelJson = d; } };
    },
    setHeader: () => {},
    send: () => {}
  };
  await reportController.exportSalesReportExcel(mockReq, mockExcelRes);
  assert(excelStatus === 400, `Excel export with future date returns HTTP 400 (got ${excelStatus})`);

  // Test 11: Non-string and repeated query parameters handling
  console.log("\n5. Testing Non-String & Repeated Query Parameter Validation");
  {
    // A: Repeated query parameter (array of strings)
    let threwArray = false;
    let arrayErr = null;
    try {
      reportService.normalizeDateRange({
        preset: "custom",
        startDate: ["2026-10-01", "2026-10-02"],
        endDate: "2026-10-05"
      });
    } catch (err) {
      threwArray = true;
      arrayErr = err;
    }
    assert(threwArray, "Repeated query parameter (array) throws validation error");
    assert(
      arrayErr instanceof reportService.ReportValidationError,
      "Throws ReportValidationError instance for repeated parameter"
    );
    assert(
      !arrayErr.message.includes("trim is not a function"),
      "Does not throw or leak TypeError for repeated parameter"
    );

    // B: Object query parameter (NoSQL injection pattern)
    let threwObj = false;
    let objErr = null;
    try {
      reportService.normalizeDateRange({
        preset: "custom",
        startDate: { $gt: "2026-01-01" },
        endDate: "2026-10-05"
      });
    } catch (err) {
      threwObj = true;
      objErr = err;
    }
    assert(threwObj, "Object query parameter throws validation error");
    assert(
      objErr instanceof reportService.ReportValidationError,
      "Throws ReportValidationError instance for object parameter"
    );

    // C: Number query parameter
    let threwNum = false;
    try {
      reportService.normalizeDateRange({
        preset: "custom",
        startDate: 20261001,
        endDate: "2026-10-05"
      });
    } catch (err) {
      threwNum = true;
    }
    assert(threwNum, "Number query parameter throws validation error");

    // D: Verify isDateValidationError correctly distinguishes ReportValidationError from TypeError
    const valErr = new reportService.ReportValidationError("Test validation error");
    const typeErr = new TypeError("startDate.trim is not a function");
    const genericErr = new Error("Database connection timed out");

    assert(
      reportController.isDateValidationError(valErr) === true,
      "isDateValidationError recognizes ReportValidationError instance"
    );
    assert(
      reportController.isDateValidationError(typeErr) === false,
      "isDateValidationError safely rejects TypeError (does not misclassify as 400 validation)"
    );
    assert(
      reportController.isDateValidationError(genericErr) === false,
      "isDateValidationError safely rejects generic server Error"
    );

    // E: Controller handles repeated query parameter gracefully with HTTP 400
    const mockReqRepeated = {
      query: {
        preset: "custom",
        startDate: ["2026-10-01", "2026-10-02"],
        endDate: "2026-10-05"
      }
    };
    let repStatus = null;
    let repJson = null;
    const mockRepRes = {
      status: (code) => {
        repStatus = code;
        return {
          json: (data) => {
            repJson = data;
          }
        };
      }
    };

    await reportController.getSalesReportData(mockReqRepeated, mockRepRes);
    assert(repStatus === 400, `Repeated parameter returns HTTP 400 (got ${repStatus})`);
    assert(repJson && repJson.success === false, "Repeated parameter returns success: false");
    assert(
      repJson && !repJson.message.includes("is not a function"),
      `Safe error message returned without TypeError leak: "${repJson?.message}"`
    );

    // F: Repeated preset parameter (array)
    let threwRepeatedPreset = false;
    let presetErr = null;
    try {
      reportService.normalizeDateRange({ preset: ["today", "yesterday"] });
    } catch (err) {
      threwRepeatedPreset = true;
      presetErr = err;
    }
    assert(threwRepeatedPreset, "Repeated preset parameter (array) throws validation error");
    assert(presetErr instanceof reportService.ReportValidationError, "Throws ReportValidationError for repeated preset");
    assert(!presetErr.message.includes("toLowerCase is not a function"), "Does not throw or leak TypeError for repeated preset");

    // G: Object preset parameter
    let threwObjectPreset = false;
    try {
      reportService.normalizeDateRange({ preset: { $gt: "" } });
    } catch (err) {
      threwObjectPreset = true;
      assert(err instanceof reportService.ReportValidationError, "Throws ReportValidationError for object preset");
    }
    assert(threwObjectPreset, "Object preset parameter throws validation error");

    // H: Repeated and object filters in buildQualifyingOrderMatch
    let threwArrayPayment = false;
    try {
      await reportService.buildQualifyingOrderMatch(new Date(), new Date(), {
        paymentMethod: ["COD", "WALLET"]
      });
    } catch (err) {
      threwArrayPayment = true;
      assert(err instanceof reportService.ReportValidationError, "Throws ReportValidationError for array paymentMethod");
      assert(!err.message.includes("toUpperCase is not a function"), "No TypeError for array paymentMethod");
    }
    assert(threwArrayPayment, "Array paymentMethod rejected with validation error");

    let threwObjPayment = false;
    try {
      await reportService.buildQualifyingOrderMatch(new Date(), new Date(), {
        paymentMethod: { $ne: null }
      });
    } catch (err) {
      threwObjPayment = true;
      assert(err instanceof reportService.ReportValidationError, "Throws ReportValidationError for object paymentMethod");
    }
    assert(threwObjPayment, "Object paymentMethod rejected with validation error");

    let threwArrayStatus = false;
    try {
      await reportService.buildQualifyingOrderMatch(new Date(), new Date(), {
        orderStatus: ["DELIVERED", "CANCELLED"]
      });
    } catch (err) {
      threwArrayStatus = true;
      assert(err instanceof reportService.ReportValidationError, "Throws ReportValidationError for array orderStatus");
    }
    assert(threwArrayStatus, "Array orderStatus rejected with validation error");

    let threwArraySearch = false;
    try {
      await reportService.buildQualifyingOrderMatch(new Date(), new Date(), {
        search: ["term1", "term2"]
      });
    } catch (err) {
      threwArraySearch = true;
      assert(err instanceof reportService.ReportValidationError, "Throws ReportValidationError for array search");
      assert(!err.message.includes("trim is not a function"), "No TypeError for array search");
    }
    assert(threwArraySearch, "Array search rejected with validation error");

    let threwArrayGroupBy = false;
    try {
      await reportService.getSalesReportGrouped({ groupBy: ["day", "month"] });
    } catch (err) {
      threwArrayGroupBy = true;
      assert(err instanceof reportService.ReportValidationError, "Throws ReportValidationError for array groupBy");
      assert(!err.message.includes("toLowerCase is not a function"), "No TypeError for array groupBy");
    }
    assert(threwArrayGroupBy, "Array groupBy rejected with validation error");

    let threwArraySortBy = false;
    try {
      await reportService.getSalesReportDetails({ sortBy: ["createdAt", "finalAmount"] });
    } catch (err) {
      threwArraySortBy = true;
      assert(err instanceof reportService.ReportValidationError, "Throws ReportValidationError for array sortBy");
    }
    assert(threwArraySortBy, "Array sortBy rejected with validation error");

    // I: Controller loadSalesReport HTML route error masking
    let htmlStatus = null;
    let htmlView = null;
    let htmlData = null;
    const mockHtmlRes = {
      status: (code) => {
        htmlStatus = code;
        return {
          render: (view, data) => {
            htmlView = view;
            htmlData = data;
          }
        };
      },
      render: (view, data) => {
        htmlStatus = 200;
        htmlView = view;
        htmlData = data;
      }
    };

    // 1. Validation error returns HTTP 400 and safe message
    await reportController.loadSalesReport(
      { query: { preset: ["today", "this_month"] } },
      mockHtmlRes
    );
    assert(htmlStatus === 400, `loadSalesReport returns HTTP 400 on validation error (got ${htmlStatus})`);
    assert(
      htmlData && htmlData.error && htmlData.error.includes("Invalid preset parameter"),
      `loadSalesReport passes clean validation error to template: "${htmlData?.error}"`
    );

    // 2. Controller getSalesReportData returns HTTP 400 on repeated preset
    let jsonStatus = null;
    let jsonData = null;
    await reportController.getSalesReportData(
      { query: { preset: ["today", "this_month"] } },
      {
        status: (code) => {
          jsonStatus = code;
          return { json: (d) => { jsonData = d; } };
        }
      }
    );
    assert(jsonStatus === 400, `getSalesReportData returns HTTP 400 on repeated preset (got ${jsonStatus})`);
    assert(jsonData && jsonData.success === false, "Returns success: false for repeated preset");
    assert(
      jsonData && !jsonData.message.includes("is not a function"),
      "getSalesReportData message does not leak TypeError"
    );
  }

  console.log(`\n========================================`);
  console.log(`FINAL REPORT TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================`);

  await mongoose.disconnect();
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error("Test runner error:", err);
  process.exit(1);
});
