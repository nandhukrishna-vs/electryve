import express from 'express';
import expressLayouts from 'express-ejs-layouts';
import path from 'path';
import { fileURLToPath } from 'url';
import { routeNotFound, globalErrorHandler } from '../src/middlewares/errorHandler.js';

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
  console.log('--- STARTING COMPREHENSIVE ERROR PAGES & 404 TEST SUITE ---');
  console.log('===============================================================\n');

  // Setup Express App
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // View Engine Setup
  app.set('view engine', 'ejs');
  app.set('views', viewsDir);
  app.use(expressLayouts);
  app.set('layout', 'layouts/user-layout');

  // Dummy session & global locals middleware
  app.use((req, res, next) => {
    res.locals.user = null;
    res.locals.currentUser = null;
    res.locals.currentAdmin = null;
    res.locals.title = "Electryve";
    next();
  });

  // Sample existing routes
  app.get('/test-success', (req, res) => {
    res.json({ success: true, message: "OK" });
  });

  app.get('/test-explicit-404', (req, res, next) => {
    const err = new Error("Resource not found explicitly");
    err.statusCode = 404;
    next(err);
  });

  app.get('/test-explicit-500', (req, res, next) => {
    const err = new Error("Database connection failed");
    err.statusCode = 500;
    next(err);
  });

  // Error handlers
  app.use(routeNotFound);
  app.use(globalErrorHandler);

  // Start HTTP server on ephemeral port
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Browser HTML request to nonexistent route
    // ------------------------------------------------------------------------
    console.log('\n--- Test 1: Browser HTML Request to Nonexistent Route ---');
    const res1 = await fetch(`${baseUrl}/this-page-does-not-exist`, {
      headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
    });
    const text1 = await res1.text();

    assert(res1.status === 404, `Test 1: Status code is 404 (got ${res1.status})`);
    assert(res1.headers.get('content-type').includes('text/html'), `Test 1: Content-Type is text/html`);
    assert(text1.includes('404'), `Test 1: HTML includes '404' indicator`);
    assert(text1.includes('PAGE NOT FOUND') || text1.includes('Page Not Found') || text1.includes('Lost in Electryve Space'), `Test 1: HTML includes 'Page Not Found' message`);
    assert(text1.includes('Back to Home'), `Test 1: HTML includes 'Back to Home' button`);
    assert(text1.includes('Continue Shopping'), `Test 1: HTML includes 'Continue Shopping' button`);
    assert(text1.includes('ELECTRYVE'), `Test 1: HTML includes Electryve branding`);
    assert(text1.includes('href="/"') || text1.includes("href='/'"), `Test 1: HTML links to Home (/)`);
    assert(text1.includes('href="/shop"') || text1.includes("href='/shop'"), `Test 1: HTML links to Shop (/shop)`);

    // ------------------------------------------------------------------------
    // TEST 2: API request to nonexistent route (/api/...)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 2: API Request to Nonexistent Route ---');
    const res2 = await fetch(`${baseUrl}/api/products/missing-endpoint`, {
      headers: { 'Accept': '*/*' }
    });
    const data2 = await res2.json();

    assert(res2.status === 404, `Test 2: Status code is 404 (got ${res2.status})`);
    assert(res2.headers.get('content-type').includes('application/json'), `Test 2: Content-Type is application/json`);
    assert(data2.success === false, `Test 2: JSON success is false`);
    assert(data2.message === "Route not found", `Test 2: JSON message is 'Route not found'`);

    // ------------------------------------------------------------------------
    // TEST 3: AJAX request with X-Requested-With header
    // ------------------------------------------------------------------------
    console.log('\n--- Test 3: AJAX Request with X-Requested-With Header ---');
    const res3 = await fetch(`${baseUrl}/some-missing-ajax-action`, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'text/html, */*'
      }
    });
    const data3 = await res3.json();

    assert(res3.status === 404, `Test 3: AJAX status code is 404`);
    assert(res3.headers.get('content-type').includes('application/json'), `Test 3: AJAX Content-Type is application/json`);
    assert(data3.success === false && data3.message === "Route not found", `Test 3: AJAX returns proper JSON error`);

    // ------------------------------------------------------------------------
    // TEST 4: Request with Accept: application/json
    // ------------------------------------------------------------------------
    console.log('\n--- Test 4: Request with Accept: application/json ---');
    const res4 = await fetch(`${baseUrl}/missing-route-json-header`, {
      headers: { 'Accept': 'application/json' }
    });
    const data4 = await res4.json();

    assert(res4.status === 404, `Test 4: Accept: JSON status code is 404`);
    assert(res4.headers.get('content-type').includes('application/json'), `Test 4: Content-Type is application/json`);
    assert(data4.success === false, `Test 4: JSON payload success is false`);

    // ------------------------------------------------------------------------
    // TEST 5: Missing static image asset (.png)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 5: Missing Static Image Asset (.png) ---');
    const res5 = await fetch(`${baseUrl}/uploads/products/missing-image.png`);
    const text5 = await res5.text();

    assert(res5.status === 404, `Test 5: Missing image status code is 404`);
    assert(res5.headers.get('content-type').includes('text/plain'), `Test 5: Missing image Content-Type is text/plain`);
    assert(text5 === "Resource not found", `Test 5: Missing image body is 'Resource not found'`);

    // ------------------------------------------------------------------------
    // TEST 6: Missing static stylesheet asset (.css)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 6: Missing Static Stylesheet Asset (.css) ---');
    const res6 = await fetch(`${baseUrl}/css/missing-style.css`);
    const text6 = await res6.text();

    assert(res6.status === 404, `Test 6: Missing CSS status code is 404`);
    assert(res6.headers.get('content-type').includes('text/plain'), `Test 6: Missing CSS Content-Type is text/plain`);
    assert(text6 === "Resource not found", `Test 6: Missing CSS body is 'Resource not found'`);

    // ------------------------------------------------------------------------
    // TEST 7: Missing static script asset (.js)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 7: Missing Static Script Asset (.js) ---');
    const res7 = await fetch(`${baseUrl}/js/missing-bundle.js`);
    assert(res7.status === 404, `Test 7: Missing JS status code is 404`);
    assert(res7.headers.get('content-type').includes('text/plain'), `Test 7: Missing JS Content-Type is text/plain`);

    // ------------------------------------------------------------------------
    // TEST 8: POST request to nonexistent route with JSON
    // ------------------------------------------------------------------------
    console.log('\n--- Test 8: POST Request to Nonexistent Route with JSON ---');
    const res8 = await fetch(`${baseUrl}/api/nonexistent-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: "something" })
    });
    const data8 = await res8.json();

    assert(res8.status === 404, `Test 8: POST 404 status code is 404`);
    assert(data8.success === false && data8.message === "Route not found", `Test 8: POST returns JSON 404`);

    // ------------------------------------------------------------------------
    // TEST 9: Admin HTML nonexistent route
    // ------------------------------------------------------------------------
    console.log('\n--- Test 9: Admin HTML Nonexistent Route ---');
    const res9 = await fetch(`${baseUrl}/admin/missing-admin-page`, {
      headers: { 'Accept': 'text/html,application/xhtml+xml' }
    });
    const text9 = await res9.text();

    assert(res9.status === 404, `Test 9: Admin 404 status code is 404`);
    assert(res9.headers.get('content-type').includes('text/html'), `Test 9: Admin 404 returns text/html`);
    assert(text9.includes('404') && text9.includes('Lost in Electryve Space'), `Test 9: Admin 404 renders 404 view`);

    // ------------------------------------------------------------------------
    // TEST 10: Explicitly thrown 404 via next(err)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 10: Explicitly Thrown 404 via next(err) ---');
    const res10Html = await fetch(`${baseUrl}/test-explicit-404`, {
      headers: { 'Accept': 'text/html' }
    });
    assert(res10Html.status === 404, `Test 10 (HTML): Explicit 404 returns 404 status`);
    assert(res10Html.headers.get('content-type').includes('text/html'), `Test 10 (HTML): Content-Type is text/html`);

    const res10Json = await fetch(`${baseUrl}/test-explicit-404`, {
      headers: { 'Accept': 'application/json' }
    });
    const data10Json = await res10Json.json();
    assert(res10Json.status === 404, `Test 10 (JSON): Explicit 404 returns 404 status`);
    assert(data10Json.success === false, `Test 10 (JSON): Returns JSON with success false`);

    // ------------------------------------------------------------------------
    // TEST 11: Explicit 500 error handled gracefully
    // ------------------------------------------------------------------------
    console.log('\n--- Test 11: Explicit 500 Error Handled Gracefully ---');
    const res11Json = await fetch(`${baseUrl}/test-explicit-500`, {
      headers: { 'Accept': 'application/json' }
    });
    const data11Json = await res11Json.json();
    assert(res11Json.status === 500, `Test 11 (JSON): Status is 500`);
    assert(data11Json.success === false, `Test 11 (JSON): Success is false`);

    const res11Html = await fetch(`${baseUrl}/test-explicit-500`, {
      headers: { 'Accept': 'text/html' }
    });
    assert(res11Html.status === 500, `Test 11 (HTML): Status is 500`);
    assert(res11Html.headers.get('content-type').includes('text/html'), `Test 11 (HTML): Content-Type is text/html`);

  } finally {
    server.close();
  }

  console.log('\n===============================================================');
  console.log('--- ALL 11 ERROR PAGES & 404 TESTS PASSED SUCCESSFULLY! ---');
  console.log('===============================================================\n');
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
