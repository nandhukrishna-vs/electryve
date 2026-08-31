import express from "express";
import dotenv from "dotenv";
dotenv.config();
import path from "path";
import { fileURLToPath } from "url";
import nocache from "nocache";
import methodOverride from "method-override";
import expressLayouts from "express-ejs-layouts";

import connectDB from "./src/config/db.js";
import { userSession, adminSession } from "./src/config/session.js";
import passport from "./src/config/passport.js";

import authRoutes from "./src/routes/authRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import reviewRoutes from "./src/routes/reviewRoutes.js";

import globalMiddleware from "./src/middlewares/globalMiddleware.js";
import uploadErrorHandler from "./src/middlewares/uploadErrorHandler.js";

import categoryRoutes from "./src/routes/categoryRoutes.js";

import brandRoutes from "./src/routes/brandRoutes.js";
import productRoutes from "./src/routes/productRoutes.js";

import {
  routeNotFound,
  globalErrorHandler
} from "./src/middlewares/errorHandler.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Database Connection
connectDB();

// Body Parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Disable browser cache
app.use(nocache());

// Static Files
app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

// Method Override (PUT, DELETE support)
app.use(methodOverride("_method"));

// View Engine Setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src/views"));

// EJS Layouts
app.use(expressLayouts);
app.set("layout", "layouts/user-layout");

// Session Middleware
app.use((req, res, next) => {
  if (req.path.startsWith("/admin")) {
    adminSession(req, res, next);
  } else {
    userSession(req, res, next);
  }
});

// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

// Global Middleware
app.use(globalMiddleware);

// Routes
app.use("/auth", authRoutes);
app.use("/", userRoutes);
app.use("/", reviewRoutes);
app.use("/admin", adminRoutes);
app.use("/admin/categories", categoryRoutes);
app.use("/admin/brands", brandRoutes);
app.use("/admin/products", productRoutes);
app.use(uploadErrorHandler);
// Error Handling
app.use(routeNotFound);
app.use(globalErrorHandler);

// Server Start
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});