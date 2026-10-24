/**
 * Electryve Master Pre-Hosting Test Runner
 *
 * Runs all intended regression suites against an isolated test database (electryve_test),
 * parses and aggregates exact assertion counts accurately,
 * tests real JavaScript syntax with `node -c`,
 * and tests the actual `src/config/session.js` module in production mode.
 */
import { spawn, execFileSync } from "child_process";
import path from "path";
import fs from "fs";
import ejs from "ejs";

// Enforce test environment and isolated test database
process.env.NODE_ENV = "test";
const TEST_DB_URI =
  process.env.TEST_MONGO_URI ||
  process.env.TEST_MONGODB_URI ||
  "mongodb://127.0.0.1:27017/electryve_test";

process.env.TEST_MONGO_URI = TEST_DB_URI;
process.env.TEST_MONGODB_URI = TEST_DB_URI;
process.env.MONGO_URI = TEST_DB_URI;
process.env.MONGODB_URI = TEST_DB_URI;
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "secure-random-test-session-secret-at-least-32-chars-long";
process.env.PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || "https://electryve.test";

const rootDir = process.cwd();

let totalPassed = 0;
let totalFailed = 0;
const results = [];

function recordResult(suiteName, passed, failed, details = "") {
  totalPassed += passed;
  totalFailed += failed;
  results.push({ suiteName, passed, failed, details });
}

function extractAssertionCounts(output) {
  // 1. Check known summary patterns (take last occurrence to avoid intermediate logs)
  const allM1 = [
    ...output.matchAll(
      /(?:TEST SUMMARY|AUDIT TEST RESULTS|FINAL REPORT TESTS|RESULTS|TEST RESULTS|FINAL RESULT|ALL TESTS PASSED):\s*(\d+)\s*(?:PASSED|\/|\bpassed\b)[,\s]+(\d+)\s*(?:FAILED|\bfailed\b)/gi
    )
  ];
  if (allM1.length > 0) {
    const last = allM1[allM1.length - 1];
    return { passed: parseInt(last[1], 10), failed: parseInt(last[2], 10), recognized: true };
  }

  const m2 = output.match(/Passed:\s*(\d+)\s*[\r\n]+\s*Failed:\s*(\d+)/i);
  if (m2) {
    return { passed: parseInt(m2[1], 10), failed: parseInt(m2[2], 10), recognized: true };
  }

  const m3 = output.match(/ALL TESTS PASSED:\s*(\d+)\s*\/\s*(\d+)/i);
  if (m3) {
    const p = parseInt(m3[1], 10);
    const total = parseInt(m3[2], 10);
    return { passed: p, failed: Math.max(0, total - p), recognized: true };
  }

  const m4 = output.match(/ALL WALLET TESTS PASSED!\s*\((\d+)\/(\d+)\)/i);
  if (m4) {
    const p = parseInt(m4[1], 10);
    const total = parseInt(m4[2], 10);
    return { passed: p, failed: Math.max(0, total - p), recognized: true };
  }

  const m5 = output.match(/Passed:\s*(\d+)\/(\d+)\s*tests/i);
  if (m5) {
    const p = parseInt(m5[1], 10);
    const total = parseInt(m5[2], 10);
    return { passed: p, failed: Math.max(0, total - p), recognized: true };
  }

  // 2. Fallback: Count individual test marker lines
  const passMatches = output.match(/(?:\[PASS\]|✓ PASS|PASS:|✅ PASS)/g);
  const failMatches = output.match(/(?:\[FAIL\]|✗ FAIL|FAIL:|❌ FAIL)/g);
  const p = passMatches ? passMatches.length : 0;
  const f = failMatches ? failMatches.length : 0;

  if (p > 0 || f > 0) {
    return { passed: p, failed: f, recognized: true };
  }

  // Unrecognized result: 0 assertions could be extracted
  return { passed: 0, failed: 0, recognized: false };
}

async function runChildScript(scriptPath, suiteName) {
  return new Promise((resolve) => {
    console.log(`\n======================================================`);
    console.log(`RUNNING SUITE: ${suiteName} (${scriptPath})`);
    console.log(`Database Target: ${TEST_DB_URI}`);
    console.log(`======================================================`);

    const child = spawn(process.execPath, [scriptPath], {
      cwd: rootDir,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let combinedOutput = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      combinedOutput += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      combinedOutput += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      const counts = extractAssertionCounts(combinedOutput);
      const isRecognized = counts.recognized && counts.passed > 0;
      if (code === 0 && counts.failed === 0 && isRecognized) {
        console.log(`\n[PASS] Suite '${suiteName}' completed: ${counts.passed} passed, 0 failed.`);
        recordResult(suiteName, counts.passed, 0);
        resolve(true);
      } else {
        const failedCount = counts.failed > 0 ? counts.failed : 1;
        let failureDetail = "";
        if (!isRecognized && code === 0) {
          failureDetail = "Unrecognized test result (0 assertions parsed from output)";
        } else if (code !== 0) {
          failureDetail = `Failed with exit code ${code}`;
        } else {
          failureDetail = `${counts.failed} assertion(s) failed`;
        }
        console.error(
          `\n[FAIL] Suite '${suiteName}' failed: ${counts.passed} passed, ${failedCount} failed (${failureDetail}).`
        );
        recordResult(suiteName, counts.passed, failedCount, failureDetail);
        resolve(false);
      }
    });
  });
}

// SUITE 1: JS Syntax Check (Node -c)
function testJsSyntax() {
  console.log("\n======================================================");
  console.log("RUNNING SUITE: JavaScript Syntax Check (node -c)");
  console.log("======================================================");

  let passed = 0;
  let failed = 0;
  const errors = [];

  function checkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "public", "coverage"].includes(entry.name)) {
          checkDir(full);
        }
      } else if (entry.name.endsWith(".js")) {
        try {
          execFileSync(process.execPath, ["-c", full], { stdio: "pipe" });
          passed++;
        } catch (err) {
          failed++;
          errors.push({ file: full, msg: err.stderr?.toString() || err.message });
        }
      }
    }
  }

  checkDir(path.join(rootDir, "src"));

  for (const rootFile of ["app.js", "seedUsers.js"]) {
    const full = path.join(rootDir, rootFile);
    if (fs.existsSync(full)) {
      try {
        execFileSync(process.execPath, ["-c", full], { stdio: "pipe" });
        passed++;
      } catch (err) {
        failed++;
        errors.push({ file: full, msg: err.stderr?.toString() || err.message });
      }
    }
  }

  if (failed > 0) {
    for (const e of errors) {
      console.error(`  [SYNTAX ERROR] in ${e.file}:\n${e.msg}`);
    }
  } else {
    console.log(`  [PASS] Successfully validated syntax of all ${passed} JavaScript files.`);
  }

  recordResult("JavaScript Syntax Validation", passed, failed);
}

// SUITE 2: EJS Compilation Check
function testEjsTemplates() {
  console.log("\n======================================================");
  console.log("RUNNING SUITE: EJS Template Compilation");
  console.log("======================================================");

  let passed = 0;
  let failed = 0;

  function scanViews(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanViews(full);
      } else if (entry.name.endsWith(".ejs")) {
        try {
          const content = fs.readFileSync(full, "utf8");
          ejs.compile(content, { filename: full, client: false });
          passed++;
        } catch (err) {
          console.error(`  [FAIL] EJS syntax error in ${path.relative(rootDir, full)}: ${err.message}`);
          failed++;
        }
      }
    }
  }

  const viewsDir = path.join(rootDir, "src", "views");
  if (fs.existsSync(viewsDir)) {
    scanViews(viewsDir);
  }
  console.log(`  [PASS] Successfully compiled all ${passed} EJS templates.`);
  recordResult("EJS Template Compilation", passed, failed);
}

// SUITE 3: Test ACTUAL Production Session Config
function testActualSessionConfig() {
  console.log("\n======================================================");
  console.log("RUNNING SUITE: Actual Production Session Configuration");
  console.log("Testing: src/config/session.js in production mode");
  console.log("======================================================");

  let passed = 0;
  let failed = 0;

  function runSessionCheck(secretValue, shouldReject, testName) {
    try {
      const script = `
        process.env.NODE_ENV = 'production';
        ${secretValue === undefined ? "delete process.env.SESSION_SECRET;" : `process.env.SESSION_SECRET = ${JSON.stringify(secretValue)};`}
        try {
          await import('./src/config/session.js');
          process.exit(0);
        } catch (err) {
          if (err.message && err.message.includes('[SECURITY CONFIG ERROR]')) {
            process.exit(42);
          }
          console.error(err);
          process.exit(1);
        }
      `;
      execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: rootDir,
        stdio: "pipe",
        env: { ...process.env, NODE_ENV: "production" }
      });

      if (!shouldReject) {
        console.log(`  [PASS] ${testName}`);
        passed++;
      } else {
        console.error(`  [FAIL] ${testName} (expected rejection, but was accepted)`);
        failed++;
      }
    } catch (err) {
      if (err.status === 42) {
        if (shouldReject) {
          console.log(`  [PASS] ${testName}`);
          passed++;
        } else {
          console.error(`  [FAIL] ${testName} (expected acceptance, but threw security error)`);
          failed++;
        }
      } else {
        console.error(`  [FAIL] ${testName} (unexpected error status ${err.status})`);
        failed++;
      }
    }
  }

  runSessionCheck(undefined, true, "Actual session.js rejects missing SESSION_SECRET in production");
  runSessionCheck("", true, "Actual session.js rejects empty SESSION_SECRET in production");
  runSessionCheck("   ", true, "Actual session.js rejects whitespace-only SESSION_SECRET in production");
  runSessionCheck("short-secret-under-32-chars", true, "Actual session.js rejects short secret (<32 chars) in production");
  runSessionCheck("electryve-session-secret-fallback", true, "Actual session.js rejects known fallback secret");
  runSessionCheck("12345678901234567890123456789012", true, "Actual session.js rejects known numeric dev secret");
  runSessionCheck("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", true, "Actual session.js rejects low character-diversity placeholder secret via heuristic");
  runSessionCheck("abcdefghabcdefghabcdefghabcdefgh", true, "Actual session.js rejects repeating pattern secret (e.g. abcdefgh*4) in production");
  runSessionCheck("9f8a3c2e1b4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f", false, "Actual session.js accepts strong 64-char random secret");

  function runSessionDbCheck(mongoUriValue, shouldReject, testName) {
    try {
      const script = `
        process.env.NODE_ENV = 'production';
        process.env.SESSION_SECRET = '9f8a3c2e1b4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f';
        ${mongoUriValue === undefined ? 'process.env.MONGODB_URI = ""; process.env.MONGO_URI = "";' : `process.env.MONGODB_URI = ${JSON.stringify(mongoUriValue)};`}
        try {
          await import('./src/config/session.js');
          process.exit(0);
        } catch (err) {
          if (err.message && err.message.includes('[DATABASE CONFIG ERROR]')) {
            process.exit(42);
          }
          console.error(err);
          process.exit(1);
        }
      `;
      execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: rootDir,
        stdio: "pipe",
        env: { ...process.env, NODE_ENV: "production" }
      });

      if (!shouldReject) {
        console.log(`  [PASS] ${testName}`);
        passed++;
      } else {
        console.error(`  [FAIL] ${testName} (expected rejection, but was accepted)`);
        failed++;
      }
    } catch (err) {
      if (err.status === 42) {
        if (shouldReject) {
          console.log(`  [PASS] ${testName}`);
          passed++;
        } else {
          console.error(`  [FAIL] ${testName} (expected acceptance, but threw database error)`);
          failed++;
        }
      } else {
        console.error(`  [FAIL] ${testName} (unexpected error status ${err.status})`);
        failed++;
      }
    }
  }

  runSessionDbCheck(undefined, true, "Actual session.js rejects missing MONGODB_URI in production");
  runSessionDbCheck("mongodb://127.0.0.1:27017/electryve_test", false, "Actual session.js accepts valid MONGODB_URI in production");

  recordResult("Actual Production Session Config", passed, failed);
}

// SUITE 4: Production Public Referral URL Invariants
async function testPublicReferralUrlInvariants() {
  console.log("\n======================================================");
  console.log("RUNNING SUITE: Public Referral URL Resolution Invariants");
  console.log("======================================================");

  let passed = 0;
  let failed = 0;
  const assert = (cond, msg) => {
    if (cond) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  };

  const { getPublicBaseUrl } = await import("../src/services/referralService.js");

  const origEnv = process.env.NODE_ENV;
  const origBase = process.env.PUBLIC_BASE_URL;

  try {
    process.env.NODE_ENV = "production";

    // 1: Rejects missing PUBLIC_BASE_URL in production
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.BASE_URL;
    delete process.env.APP_URL;
    let threwMissing = false;
    try {
      getPublicBaseUrl();
    } catch (e) {
      threwMissing = e.message.includes("PUBLIC_BASE_URL");
    }
    assert(threwMissing, "Production strictly rejects missing PUBLIC_BASE_URL");

    // 2: Rejects HTTP in production
    process.env.PUBLIC_BASE_URL = "http://insecure.electryve.com";
    let threwInsecure = false;
    try {
      getPublicBaseUrl();
    } catch (e) {
      threwInsecure = e.message.includes("HTTPS");
    }
    assert(threwInsecure, "Production strictly rejects insecure HTTP PUBLIC_BASE_URL");

    // 3: Accepts valid HTTPS in production
    process.env.PUBLIC_BASE_URL = "https://electryve.com";
    const resolvedProd = getPublicBaseUrl();
    assert(resolvedProd === "https://electryve.com", "Production resolves canonical HTTPS origin");

    // 4: Strips trailing slashes
    process.env.PUBLIC_BASE_URL = "https://electryve.com///";
    const resolvedSlashes = getPublicBaseUrl();
    assert(resolvedSlashes === "https://electryve.com", "Strips trailing slashes from PUBLIC_BASE_URL");

    // 5: In development mode, defaults safely
    process.env.NODE_ENV = "development";
    delete process.env.PUBLIC_BASE_URL;
    const devUrl = getPublicBaseUrl();
    assert(devUrl === "http://localhost:3000", "Development defaults safely to http://localhost:3000");

  } finally {
    process.env.NODE_ENV = origEnv;
    if (origBase) process.env.PUBLIC_BASE_URL = origBase;
  }

  recordResult("Public Referral URL Invariants", passed, failed);
}

function testAssertionParserInvariants() {
  console.log("\n======================================================");
  console.log("RUNNING SUITE: Test Assertion Parser & Recognition Invariants");
  console.log("======================================================");

  let passed = 0;
  let failed = 0;
  const assert = (cond, msg) => {
    if (cond) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  };

  const emptyRes = extractAssertionCounts("");
  assert(!emptyRes.recognized && emptyRes.passed === 0 && emptyRes.failed === 0, "Empty output treated as unrecognized");

  const unrecRes = extractAssertionCounts("Random console output without any test assertions or summaries");
  assert(!unrecRes.recognized && unrecRes.passed === 0 && unrecRes.failed === 0, "Unrecognized log treated as unrecognized");

  const passMarkerRes = extractAssertionCounts("✓ PASS: One\n✓ PASS: Two\n✓ PASS: Three");
  assert(passMarkerRes.recognized && passMarkerRes.passed === 3 && passMarkerRes.failed === 0, "Recognizes checkmark PASS markers");

  const bracketPassRes = extractAssertionCounts("[PASS] Test A\n[FAIL] Test B");
  assert(bracketPassRes.recognized && bracketPassRes.passed === 1 && bracketPassRes.failed === 1, "Recognizes bracketed PASS/FAIL markers");

  const summaryRes = extractAssertionCounts("Some log\n========================================\nRESULTS: 42 PASSED, 0 FAILED\n========================================");
  assert(summaryRes.recognized && summaryRes.passed === 42 && summaryRes.failed === 0, "Recognizes standard RESULTS summary block");

  recordResult("Assertion Parser Recognition Invariants", passed, failed);
}

async function main() {
  console.log("######################################################");
  console.log("       ELECTRYVE MASTER PRE-HOSTING TEST SUITE        ");
  console.log("######################################################");

  testJsSyntax();
  testEjsTemplates();
  testActualSessionConfig();
  await testPublicReferralUrlInvariants();
  testAssertionParserInvariants();

  // All intended regression suites (tracked in tests/)
  const regressionSuites = [
    { file: "tests/test_report_future_date_validation.js", name: "Sales Report Date & Boundary Suite" },
    { file: "tests/test_prehosting_fixes.js", name: "Express Aliases & Address Security Suite" },
    { file: "tests/test_message_audit.js", name: "Customer & Admin Message Audit Suite" },
    { file: "tests/test_wishlist_hardening.js", name: "Wishlist Atomic Concurrency Suite" },
    { file: "tests/test_admin_sales_report.js", name: "Admin Sales Report & Financial Suite" },
    { file: "tests/test_admin_dashboard.js", name: "Admin Dashboard & Analytics Suite" },
    { file: "tests/test_referral_management.js", name: "Referral Management System Suite" },
    { file: "tests/test_cart_product_update_regression.js", name: "Cart & Product Update Regression Suite" },
    { file: "tests/test_wallet_management.js", name: "Wallet Operations & Refunds Suite" },
    { file: "tests/test_order_item_cancellation.js", name: "Order Item Cancellation Rules Suite" },
    { file: "tests/test_coupon_redesign.js", name: "Coupon Redesign & Pipeline Suite" }
  ];

  for (const s of regressionSuites) {
    if (fs.existsSync(s.file)) {
      await runChildScript(s.file, s.name);
    } else {
      console.error(`  [FAIL] Required suite file not found: ${s.file}`);
      recordResult(s.name, 0, 1, `File not found: ${s.file}`);
    }
  }

  console.log("\n######################################################");
  console.log("                  TEST SUITE SUMMARY                  ");
  console.log("######################################################");
  for (const r of results) {
    const status = r.failed === 0 ? "PASSED" : "FAILED";
    console.log(`  [${status}] ${r.suiteName}: ${r.passed} passed, ${r.failed} failed`);
  }
  console.log("------------------------------------------------------");
  console.log(`TOTAL ASSERTIONS: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log("######################################################\n");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
