import ejs from "ejs";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n==================================================");
  console.log("🚀 STARTING ELECTRYVE USER HOMEPAGE TEST SUITE");
  console.log("==================================================\n");

  const homeTemplatePath = path.resolve("src/views/user/home.ejs");
  const layoutTemplatePath = path.resolve("src/views/layouts/user-layout.ejs");

  assert(fs.existsSync(homeTemplatePath), `Home template exists at ${homeTemplatePath}`);
  assert(fs.existsSync(layoutTemplatePath), `Layout template exists at ${layoutTemplatePath}`);

  const homeEjsContent = fs.readFileSync(homeTemplatePath, "utf-8");
  const layoutEjsContent = fs.readFileSync(layoutTemplatePath, "utf-8");

  // Connect DB
  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/electryve";
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  // Import services
  const homeService = await import("../src/services/homeService.js");
  const offerService = await import("../src/services/offerService.js");
  const userController = await import("../src/controllers/userController.js");
  const Banner = (await import("../src/models/Banner.js")).default;
  const Category = (await import("../src/models/Category.js")).default;
  const Product = (await import("../src/models/Product.js")).default;

  // --- Test Group 1: Service Contract & Data Orchestration ---
  console.log("\n--- Test Group 1: Service Contract & Data Orchestration ---");
  const homeData = await homeService.getHomePageData({ userId: null });

  assert(Array.isArray(homeData.categories), "categories is an array");
  assert(homeData.categories.length > 0, `Found ${homeData.categories.length} categories`);
  assert(Array.isArray(homeData.banners), "banners is an array");
  assert(homeData.banners.length > 0, `Found ${homeData.banners.length} banners`);
  assert(Array.isArray(homeData.bestSellers), "bestSellers is an array");
  assert(Array.isArray(homeData.newArrivals), "newArrivals is an array");
  assert(Array.isArray(homeData.featuredProducts), "featuredProducts is an array");
  assert(homeData.referralProgram !== undefined, "referralProgram is provided");

  // --- Test Group 2: Shared Function Contract Rule (CRITICAL) ---
  console.log("\n--- Test Group 2: Shared Function Contract Rule ---");
  const rawProducts = await Product.find({ isListed: true, isDeleted: false }).limit(3).lean();
  const catalogOfferMap = await offerService.getOffersForCatalog(rawProducts);
  assert(catalogOfferMap instanceof Map, "CRITICAL: getOffersForCatalog() strictly returns a Map instance");

  // --- Test Group 3: Category Functionality & Filtering ---
  console.log("\n--- Test Group 3: Category Functionality & Filtering ---");
  const firstCat = homeData.categories[0];
  assert(firstCat && firstCat.name, "Category has valid name");
  assert(typeof firstCat.icon === "string" && firstCat.icon.startsWith("bi-"), `Category has icon: ${firstCat.icon}`);
  assert(typeof firstCat.productCount === "number", `Category has productCount: ${firstCat.productCount}`);

  // Test category click link encoding
  const expectedCategoryUrl = `/shop?category=${encodeURIComponent(firstCat.name)}`;
  assert(homeEjsContent.includes("/shop?category="), "home.ejs contains category filter navigation to /shop?category=");

  // --- Test Group 4: Product Image & Data Structure ---
  console.log("\n--- Test Group 4: Product Image & Data Structure ---");
  if (homeData.newArrivals.length > 0) {
    const prod = homeData.newArrivals[0];
    assert(prod.name !== undefined, "Product has name");
    assert(prod._id !== undefined, "Product has _id");
    assert(prod.primaryImage !== undefined, "Product has primaryImage defined");
    assert(prod.stockStatus !== undefined, "Product has stockStatus defined");
    assert(typeof prod.effectivePrice === "number", `Product has effectivePrice: ${prod.effectivePrice}`);
    assert(typeof prod.discountPercentage === "number", `Product has discountPercentage: ${prod.discountPercentage}`);
  }

  // --- Test Group 5: Best Seller Calculation & Rules ---
  console.log("\n--- Test Group 5: Best Seller Calculation & Rules ---");
  const bestSellers = await homeService.getBestSellingProducts(5);
  assert(Array.isArray(bestSellers), "getBestSellingProducts returns an array");
  bestSellers.forEach(bs => {
    assert(bs.isListed === true, `Best seller ${bs.name} is listed`);
    assert(bs.isDeleted === false, `Best seller ${bs.name} is not deleted`);
  });

  // --- Test Group 6: New Arrivals Ordering ---
  console.log("\n--- Test Group 6: New Arrivals Ordering ---");
  const newArrivals = await homeService.getNewArrivals(5);
  assert(Array.isArray(newArrivals), "getNewArrivals returns an array");
  if (newArrivals.length >= 2) {
    const d0 = new Date(newArrivals[0].createdAt).getTime();
    const d1 = new Date(newArrivals[1].createdAt).getTime();
    assert(d0 >= d1, "New arrivals are ordered by createdAt descending");
  }

  // --- Test Group 7: Banner Model & Dynamic Expiry Filter ---
  console.log("\n--- Test Group 7: Banner Model & Dynamic Expiry Filter ---");
  const testBanner = new Banner({
    title: "Expired Test Banner",
    subtitle: "Should not appear",
    badge: "Expired",
    image: "https://example.com/expired.jpg",
    isActive: true,
    expiryAt: new Date(Date.now() - 3600000) // expired 1 hour ago
  });
  await testBanner.save();

  const activeBanners = await homeService.getStorefrontBanners();
  const foundExpired = activeBanners.some(b => b.title === "Expired Test Banner");
  assert(!foundExpired, "Expired banners are strictly excluded from storefront");
  await Banner.deleteOne({ _id: testBanner._id });

  // Inactive banner test
  const inactiveBanner = new Banner({
    title: "Inactive Test Banner",
    subtitle: "Should not appear",
    image: "https://example.com/inactive.jpg",
    isActive: false
  });
  await inactiveBanner.save();
  const activeBanners2 = await homeService.getStorefrontBanners();
  const foundInactive = activeBanners2.some(b => b.title === "Inactive Test Banner");
  assert(!foundInactive, "Inactive banners are strictly excluded from storefront");
  await Banner.deleteOne({ _id: inactiveBanner._id });

  // --- Test Group 8: Full EJS Rendering with Real Data ---
  console.log("\n--- Test Group 8: Full EJS Rendering with Real Data ---");
  try {
    const renderedBody = ejs.render(homeEjsContent, {
      ...homeData
    }, { filename: homeTemplatePath });

    assert(typeof renderedBody === "string" && renderedBody.length > 500, "Home template rendered successfully");
    assert(renderedBody.includes("Premium Electronics"), "Hero badge 'Premium Electronics' rendered");
    assert(renderedBody.includes("Welcome to <br> Electryve") || renderedBody.includes("Welcome to"), "Hero title rendered");
    assert(renderedBody.includes("/images/electryve-hero-transparent.png"), "Hero collage image rendered");
    assert(renderedBody.includes("Shop by Category"), "Categories section rendered");
    assert(renderedBody.includes("Best Sellers"), "Best Sellers section rendered");
    assert(renderedBody.includes("New Arrivals"), "New Arrivals section rendered");
    assert(renderedBody.includes("Free Delivery"), "Service benefits section rendered");
    assert(renderedBody.includes("/refer-and-earn"), "Referral CTA link rendered");
    assert(renderedBody.includes("id=\"homePromoSlider\""), "Promotional slider element rendered");

    // Test full layout wrapping
    const fullHtml = ejs.render(layoutEjsContent, {
      title: "Electryve | Premium Electronics Store",
      user: null,
      body: renderedBody
    }, { filename: layoutTemplatePath });

    assert(fullHtml.includes("ELECTRYVE"), "Layout header contains ELECTRYVE brand");
    assert(fullHtml.includes("href=\"/#categories\""), "Navbar Categories link points to /#categories");
    assert(fullHtml.includes("href=\"/shop\""), "Navbar Shop link points to /shop");
    assert(fullHtml.includes("href=\"/cart\""), "Navbar Cart link points to /cart");
    assert(fullHtml.includes("href=\"/wishlist\""), "Navbar Wishlist link points to /wishlist");
    assert(fullHtml.includes("href=\"/auth/login\""), "Navbar Login button rendered when user is null");
  } catch (err) {
    assert(false, `EJS rendering failed: ${err.message}`);
  }

  // --- Test Group 9: Edge Case Rendering (Zero Categories & Zero Products) ---
  console.log("\n--- Test Group 9: Edge Case Rendering (Zero Categories & Zero Products) ---");
  try {
    const emptyHtml = ejs.render(homeEjsContent, {
      categories: [],
      banners: [],
      featuredProducts: [],
      bestSellers: [],
      newArrivals: [],
      referralProgram: null
    }, { filename: homeTemplatePath });

    assert(!emptyHtml.includes("ReferenceError"), "Zero-data rendering threw no errors");
    assert(emptyHtml.includes("No categories currently available"), "Graceful empty categories state rendered");
    assert(emptyHtml.includes("No best sellers available yet"), "Graceful empty best sellers state rendered");
    assert(emptyHtml.includes("No new arrivals available"), "Graceful empty new arrivals state rendered");
    assert(!emptyHtml.includes("id=\"homePromoSlider\""), "Slider cleanly omitted when banners is empty");
  } catch (err) {
    assert(false, `Empty state rendering failed: ${err.message}`);
  }

  // --- Test Group 10: Controller Execution Contract ---
  console.log("\n--- Test Group 10: Controller Execution Contract ---");
  let renderedView = null;
  let renderedPayload = null;
  const mockReq = { session: { user: { id: new mongoose.Types.ObjectId() } } };
  const mockRes = {
    render: (view, data) => {
      renderedView = view;
      renderedPayload = data;
    }
  };
  let controllerErr = null;

  await userController.loadHome(mockReq, mockRes, (err) => {
    controllerErr = err;
  });

  assert(controllerErr === null, "loadHome executed without error");
  assert(renderedView === "user/home", "Controller rendered user/home");
  assert(renderedPayload.layout === "layouts/user-layout", "Controller used layouts/user-layout");
  assert(Array.isArray(renderedPayload.categories), "Controller passed categories");
  assert(Array.isArray(renderedPayload.banners), "Controller passed banners");
  assert(Array.isArray(renderedPayload.bestSellers), "Controller passed bestSellers");
  assert(Array.isArray(renderedPayload.newArrivals), "Controller passed newArrivals");

  console.log("\n==================================================");
  console.log(`FINAL RESULT: ${passed} passed, ${failed} failed`);
  console.log("==================================================\n");

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Unhandled test runner error:", err);
  process.exit(1);
});
