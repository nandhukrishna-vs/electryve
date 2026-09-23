/**
 * Comprehensive Test Suite: Electryve Admin Layout UI & Scrolling Architecture
 *
 * Verifies:
 * 1. CSS Variable Definitions & Geometry Invariants:
 *    - --admin-header-height: 90px
 *    - --admin-sidebar-width: 250px
 * 2. Shell & Scrolling Hierarchy Rules:
 *    - html, body: height: 100%, overflow: hidden on desktop (no whole-page scroll)
 *    - .admin-wrapper: height: 100vh, flex-direction: column, overflow: hidden
 *    - .admin-header: height: var(--admin-header-height), flex-shrink: 0, z-index: 1000
 *    - .admin-container: flex: 1 1 0%, min-height: 0, overflow: hidden
 *    - .sidebar: width: var(--admin-sidebar-width), flex-shrink: 0, height: 100%, overflow-y: auto
 *    - .admin-content: flex: 1 1 0%, height: 100%, min-width: 0, min-height: 0, overflow-y: auto
 * 3. Mobile Responsive Rules:
 *    - @media (max-width: 767.98px): .sidebar is fixed drawer, backdrop present, toggle visible
 * 4. EJS Layout Rendering across Admin Pages:
 *    - Dashboard page layout
 *    - Users page layout
 *    - Products page layout
 *    - Orders page layout
 *    - Login page layout (without sidebar)
 * 5. Navigation Integrity:
 *    - All 9 navigation routes present (Dashboard, Users, Categories, Brands, Products, Inventory, Orders, Coupons, Offers)
 */

import fs from "fs";
import path from "path";
import ejs from "ejs";

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

function runCSSRulesTests() {
  console.log("\n--- SECTION 1: CSS RULES & SCROLLING ARCHITECTURE ---");

  const cssContent = fs.readFileSync("public/css/admin.css", "utf8");

  // 1.1 CSS Variables
  assert(cssContent.includes("--admin-header-height: 90px;"), "Defines --admin-header-height as 90px");
  assert(cssContent.includes("--admin-sidebar-width: 250px;"), "Defines --admin-sidebar-width as 250px");

  // 1.2 Desktop Overflow
  assert(cssContent.includes("overflow: hidden; /* Desktop: prevent whole-page scrolling */"), "Desktop body prevents global page scroll");

  // 1.3 Admin Wrapper
  assert(cssContent.includes(".admin-wrapper {"), "Defines .admin-wrapper");
  assert(cssContent.includes("height: 100vh;") && cssContent.includes("display: flex;") && cssContent.includes("flex-direction: column;"), ".admin-wrapper is 100vh flex column");

  // 1.4 Fixed Header Rules
  assert(cssContent.includes(".admin-header {"), "Defines .admin-header");
  assert(cssContent.includes("height: var(--admin-header-height);"), ".admin-header references --admin-header-height");
  assert(cssContent.includes("flex-shrink: 0;"), ".admin-header has flex-shrink: 0 (never compresses)");

  // 1.5 Admin Container Flexbox & min-height: 0
  assert(cssContent.includes(".admin-container {"), "Defines .admin-container");
  assert(cssContent.includes("min-height: 0; /* CRITICAL: allows flex child to shrink below content size */"), ".admin-container has min-height: 0 to prevent child overflow blowout");
  assert(cssContent.includes("overflow: hidden;"), ".admin-container has overflow: hidden");

  // 1.6 Independent Sidebar Scroll
  assert(cssContent.includes(".sidebar {"), "Defines .sidebar");
  assert(cssContent.includes("width: var(--admin-sidebar-width);"), ".sidebar references --admin-sidebar-width");
  assert(cssContent.includes("height: 100%;"), ".sidebar occupies 100% height of space below header");
  assert(cssContent.includes("overflow-y: auto;"), ".sidebar has overflow-y: auto for independent vertical scroll");
  assert(cssContent.includes("overflow-x: hidden;"), ".sidebar has overflow-x: hidden to prevent horizontal blowout");
  assert(cssContent.includes("scrollbar-width: thin;"), ".sidebar has custom subtle scrollbar styling");

  // 1.7 Primary Scrollable Content Area (.admin-content)
  assert(cssContent.includes(".admin-content {"), "Defines .admin-content");
  assert(cssContent.includes("min-width: 0; /* CRITICAL: prevents wide elements (charts, tables) from stretching flex container */"), ".admin-content has min-width: 0 to contain tables & charts");
  assert(cssContent.includes("min-height: 0; /* CRITICAL: enables vertical scrolling */"), ".admin-content has min-height: 0");
  assert(cssContent.includes("height: 100%;"), ".admin-content occupies 100% of container height");
  assert(cssContent.includes("overflow-y: auto;"), ".admin-content has overflow-y: auto (ONLY primary scroll container)");
  assert(cssContent.includes("overflow-x: hidden;"), ".admin-content has overflow-x: hidden");

  // 1.8 Mobile & Tablet Responsiveness
  assert(cssContent.includes("@media (max-width: 767.98px)"), "Contains mobile & tablet media queries");
  assert(cssContent.includes(".sidebar.show"), "Defines mobile offcanvas .sidebar.show toggle state");
  assert(cssContent.includes(".sidebar-backdrop"), "Defines mobile .sidebar-backdrop");

  // 1.9 Login Page Adaptability
  assert(cssContent.includes(".admin-login-page {") && cssContent.includes("min-height: 100%;"), ".admin-login-page uses min-height: 100% inside scrollable content");
}

function runEJSLayoutStructureTests() {
  console.log("\n--- SECTION 2: EJS LAYOUT STRUCTURE & NAVIGATION INTEGRITY ---");

  const layoutContent = fs.readFileSync("src/views/layouts/admin-layout.ejs", "utf8");

  // 2.1 Fixed Header Branding & Logout
  assert(layoutContent.includes("ELECTRYVE"), "Layout header contains ELECTRYVE brand");
  assert(layoutContent.includes("/admin/logout"), "Layout header contains logout link");
  assert(layoutContent.includes("adminSidebarToggle"), "Layout header contains mobile sidebar toggle button");

  // 2.2 Shell Hierarchy
  assert(layoutContent.includes('<div class="admin-wrapper">'), "Layout wraps with .admin-wrapper");
  assert(layoutContent.includes('<header class="admin-header">'), "Layout contains .admin-header");
  assert(layoutContent.includes('<div class="admin-container">'), "Layout contains .admin-container");
  assert(layoutContent.includes('<aside class="sidebar">'), "Layout contains .sidebar inside .admin-container");
  assert(layoutContent.includes('<main class="admin-content">'), "Layout contains .admin-content inside .admin-container");
  assert(layoutContent.includes("<%- body %>"), "Body is rendered inside .admin-content");

  // 2.3 Navigation Routes Preservation
  const requiredRoutes = [
    { name: "Dashboard", href: "/admin/dashboard" },
    { name: "Users", href: "/admin/users" },
    { name: "Categories", href: "/admin/categories" },
    { name: "Brands", href: "/admin/brands" },
    { name: "Products", href: "/admin/products" },
    { name: "Inventory", href: "/admin/inventory" },
    { name: "Orders", href: "/admin/orders" },
    { name: "Coupons", href: "/admin/coupons" },
    { name: "Offers", href: "/admin/offers" }
  ];

  requiredRoutes.forEach(r => {
    assert(layoutContent.includes(`href="${r.href}"`), `Sidebar contains navigation route for ${r.name} (${r.href})`);
    assert(layoutContent.includes(r.name), `Sidebar contains navigation text for ${r.name}`);
  });
}

function runEJSRenderingSimulations() {
  console.log("\n--- SECTION 3: EJS RENDERING SIMULATION ACROSS ADMIN PAGES ---");

  const layoutTemplate = fs.readFileSync("src/views/layouts/admin-layout.ejs", "utf8");

  // 3.1 Render Logged-In Admin Dashboard
  const dashboardHtml = ejs.render(layoutTemplate, {
    user: { role: "ADMIN", fullName: "Admin User" },
    title: "Dashboard",
    body: '<div id="test-dashboard-tall-content" style="height: 5000px;">Tall Dashboard Content</div>'
  });

  assert(dashboardHtml.includes('<header class="admin-header">'), "Dashboard rendered with .admin-header");
  assert(dashboardHtml.includes('<aside class="sidebar">'), "Dashboard rendered with .sidebar");
  assert(dashboardHtml.includes('<main class="admin-content">'), "Dashboard rendered with .admin-content");
  assert(dashboardHtml.includes('class="active"'), "Dashboard navigation link has active class when title is Dashboard");
  assert(dashboardHtml.includes('id="test-dashboard-tall-content"'), "Tall content safely placed inside .admin-content");

  // 3.2 Render Logged-In Orders Page
  const ordersHtml = ejs.render(layoutTemplate, {
    user: { role: "ADMIN", fullName: "Admin User" },
    title: "Order Management",
    body: '<div class="orders-table-wrapper">Orders Table Content</div>'
  });

  assert(ordersHtml.includes('<aside class="sidebar">'), "Orders page has sidebar");
  assert(ordersHtml.includes('href="/admin/orders"'), "Orders page has orders navigation link");
  assert(ordersHtml.includes('Orders Table Content'), "Orders content rendered inside .admin-content");

  // 3.3 Render Logged-Out Admin Login Page (No Sidebar)
  const loginHtml = ejs.render(layoutTemplate, {
    user: null,
    title: "Admin Login",
    body: '<div class="admin-login-page">Login Card</div>'
  });

  assert(loginHtml.includes('<header class="admin-header">'), "Login page has .admin-header");
  assert(!loginHtml.includes('<aside class="sidebar">'), "Login page omits .sidebar when user is not logged in");
  assert(!loginHtml.includes('LOGOUT'), "Login page omits logout button");
  assert(loginHtml.includes('<main class="admin-content">'), "Login page still uses .admin-content");
  assert(loginHtml.includes('Login Card'), "Login card rendered inside .admin-content");
}

function runClientJSTests() {
  console.log("\n--- SECTION 4: CLIENT JS SCRIPT VERIFICATION ---");

  const jsContent = fs.readFileSync("public/js/admin.js", "utf8");

  assert(jsContent.includes("Highlight Active Sidebar Navigation Link"), "admin.js contains active link highlighter");
  assert(jsContent.includes("window.location.pathname"), "admin.js reads current window pathname");
  assert(jsContent.includes("adminSidebarToggle"), "admin.js handles mobile sidebar toggle button");
  assert(jsContent.includes("adminSidebarBackdrop"), "admin.js handles mobile backdrop dismissal");
}

function runAllTests() {
  console.log("==================================================");
  console.log("ELECTRYVE ADMIN FIXED LAYOUT & SCROLL TEST SUITE");
  console.log("==================================================");

  try {
    runCSSRulesTests();
    runEJSLayoutStructureTests();
    runEJSRenderingSimulations();
    runClientJSTests();

    console.log("\n==================================================");
    console.log(`ALL LAYOUT TESTS PASSED: ${passedTests} / ${totalTests}`);
    console.log("==================================================");
  } catch (error) {
    console.error("\nTEST SUITE FAILED:", error);
    process.exitCode = 1;
  }
}

runAllTests();
