import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { LOW_STOCK_THRESHOLD } from "./inventoryService.js";

const TIMEZONE_IST = "+05:30";

/**
 * Normalizes date boundaries to Indian Standard Time (IST, UTC+5:30)
 * 
 * Supports presets:
 * - today (or 1_day): 00:00:00.000 IST to 23:59:59.999 IST
 * - yesterday: 00:00:00.000 IST to 23:59:59.999 IST
 * - this_week (or 1_week): Monday 00:00:00.000 IST to today 23:59:59.999 IST
 * - this_month (or 1_month): 1st of current month to end of current month
 * - last_month: 1st of previous month to last day of previous month
 * - this_year: Jan 1st to Dec 31st of current year
 * - custom: Exact custom start and end dates validated server-side
 * 
 * @param {Object} options
 * @param {string} [options.preset="this_month"]
 * @param {string} [options.startDate] - YYYY-MM-DD for custom range
 * @param {string} [options.endDate] - YYYY-MM-DD for custom range
 * @returns {Object} { startDate: Date, endDate: Date, preset: string, label: string }
 */
export const normalizeDateRange = ({ preset = "this_month", startDate = null, endDate = null } = {}) => {
  // Extract current calendar date in Asia/Kolkata (IST)
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
  const todayStr = istFormatter.format(now); // "YYYY-MM-DD"
  const [currentYear, currentMonth, currentDay] = todayStr.split("-").map(Number);

  let startIsoStr = "";
  let endIsoStr = "";
  let appliedPreset = preset ? preset.toLowerCase().trim() : "this_month";
  if (appliedPreset === "1_day" || appliedPreset === "day") appliedPreset = "today";
  if (appliedPreset === "1_week" || appliedPreset === "week") appliedPreset = "this_week";
  if (appliedPreset === "1_month" || appliedPreset === "month") appliedPreset = "this_month";
  if (appliedPreset === "year") appliedPreset = "this_year";

  let label = "";

  const pad = (n) => String(n).padStart(2, "0");

  switch (appliedPreset) {
    case "today": {
      startIsoStr = `${todayStr}T00:00:00.000+05:30`;
      endIsoStr = `${todayStr}T23:59:59.999+05:30`;
      label = `Today (${todayStr})`;
      break;
    }
    case "yesterday": {
      // Previous calendar day
      const d = new Date(Date.UTC(currentYear, currentMonth - 1, currentDay - 1));
      const yStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      startIsoStr = `${yStr}T00:00:00.000+05:30`;
      endIsoStr = `${yStr}T23:59:59.999+05:30`;
      label = `Yesterday (${yStr})`;
      break;
    }
    case "this_week": {
      // Find Monday of current week in IST
      // In JS, Sunday is 0, Monday is 1, ..., Saturday is 6
      const nowUtc = new Date(Date.UTC(currentYear, currentMonth - 1, currentDay));
      const dayOfWeek = nowUtc.getUTCDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0 for Monday, 6 for Sunday
      const mondayDate = new Date(Date.UTC(currentYear, currentMonth - 1, currentDay - diffToMonday));
      const monStr = `${mondayDate.getUTCFullYear()}-${pad(mondayDate.getUTCMonth() + 1)}-${pad(mondayDate.getUTCDate())}`;

      startIsoStr = `${monStr}T00:00:00.000+05:30`;
      endIsoStr = `${todayStr}T23:59:59.999+05:30`;
      label = `This Week (${monStr} - ${todayStr})`;
      break;
    }
    case "this_month": {
      const firstDayStr = `${currentYear}-${pad(currentMonth)}-01`;
      // Last day of current month
      const lastDayDate = new Date(Date.UTC(currentYear, currentMonth, 0));
      const lastDayStr = `${currentYear}-${pad(currentMonth)}-${pad(lastDayDate.getUTCDate())}`;

      startIsoStr = `${firstDayStr}T00:00:00.000+05:30`;
      endIsoStr = `${lastDayStr}T23:59:59.999+05:30`;
      label = `This Month (${firstDayStr} - ${lastDayStr})`;
      break;
    }
    case "last_month": {
      const prevMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const firstDayPrev = `${prevMonthYear}-${pad(prevMonth)}-01`;
      const lastDayPrevDate = new Date(Date.UTC(prevMonthYear, prevMonth, 0));
      const lastDayPrev = `${prevMonthYear}-${pad(prevMonth)}-${pad(lastDayPrevDate.getUTCDate())}`;

      startIsoStr = `${firstDayPrev}T00:00:00.000+05:30`;
      endIsoStr = `${lastDayPrev}T23:59:59.999+05:30`;
      label = `Last Month (${firstDayPrev} - ${lastDayPrev})`;
      break;
    }
    case "this_year": {
      startIsoStr = `${currentYear}-01-01T00:00:00.000+05:30`;
      endIsoStr = `${currentYear}-12-31T23:59:59.999+05:30`;
      label = `This Year (${currentYear})`;
      break;
    }
    case "custom": {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!startDate || !endDate || !dateRegex.test(startDate.trim()) || !dateRegex.test(endDate.trim())) {
        throw new Error("Invalid custom date range. Please supply valid startDate and endDate in YYYY-MM-DD format.");
      }
      const s = startDate.trim();
      const e = endDate.trim();
      if (s > e) {
        throw new Error("Start date cannot be after end date.");
      }
      startIsoStr = `${s}T00:00:00.000+05:30`;
      endIsoStr = `${e}T23:59:59.999+05:30`;
      label = `Custom (${s} - ${e})`;
      break;
    }
    default: {
      // Fallback to this_month
      appliedPreset = "this_month";
      const firstDayStr = `${currentYear}-${pad(currentMonth)}-01`;
      const lastDayDate = new Date(Date.UTC(currentYear, currentMonth, 0));
      const lastDayStr = `${currentYear}-${pad(currentMonth)}-${pad(lastDayDate.getUTCDate())}`;
      startIsoStr = `${firstDayStr}T00:00:00.000+05:30`;
      endIsoStr = `${lastDayStr}T23:59:59.999+05:30`;
      label = `This Month (${firstDayStr} - ${lastDayStr})`;
      break;
    }
  }

  const startParsed = new Date(startIsoStr);
  const endParsed = new Date(endIsoStr);

  if (isNaN(startParsed.getTime()) || isNaN(endParsed.getTime())) {
    throw new Error("Malformed date encountered during normalization.");
  }

  return {
    startDate: startParsed,
    endDate: endParsed,
    startDateStr: startIsoStr.split("T")[0],
    endDateStr: endIsoStr.split("T")[0],
    preset: appliedPreset,
    label
  };
};

/**
 * Builds the authoritative MongoDB query for qualifying finalized sales orders.
 *
 * Rules:
 * 1. Razorpay/Wallet orders must be completed/paid (excludes failed/abandoned attempts).
 * 2. COD orders must not be cancelled before payment (unpaid cancelled COD orders are excluded).
 * 3. Bounded strictly by order creation time.
 * 4. Supports optional paymentMethod, orderStatus, and customer/order search filters.
 */
export const buildQualifyingOrderMatch = async (startDate, endDate, options = {}) => {
  const { paymentMethod, orderStatus, search } = options;

  const matchFilter = {
    createdAt: { $gte: startDate, $lte: endDate }
  };

  const andConditions = [];

  // Base qualifying rules:
  // Paid Razorpay / Wallet or Valid COD (non-cancelled or paid)
  let paymentCondition = {
    $or: [
      {
        paymentMethod: { $in: ["RAZORPAY", "WALLET"] },
        paymentStatus: { $in: ["COMPLETED", "PAID"] }
      },
      {
        paymentMethod: "COD",
        $or: [
          { orderStatus: { $ne: "CANCELLED" } },
          { paymentStatus: "COMPLETED" }
        ]
      }
    ]
  };

  if (paymentMethod && paymentMethod !== "ALL") {
    const pm = paymentMethod.toUpperCase();
    if (["RAZORPAY", "WALLET"].includes(pm)) {
      paymentCondition = {
        paymentMethod: pm,
        paymentStatus: { $in: ["COMPLETED", "PAID"] }
      };
    } else if (pm === "COD") {
      paymentCondition = {
        paymentMethod: "COD",
        $or: [
          { orderStatus: { $ne: "CANCELLED" } },
          { paymentStatus: "COMPLETED" }
        ]
      };
    }
  }
  andConditions.push(paymentCondition);

  if (orderStatus && orderStatus !== "ALL") {
    andConditions.push({ orderStatus: orderStatus.toUpperCase() });
  }

  if (search && search.trim()) {
    const s = search.trim();
    const matchedUsers = await User.find({
      $or: [
        { fullName: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
        { phone: { $regex: s, $options: "i" } }
      ]
    }).select("_id").lean();
    const matchedUserIds = matchedUsers.map((u) => u._id);

    andConditions.push({
      $or: [
        { orderNumber: { $regex: s, $options: "i" } },
        { "shippingAddress.fullName": { $regex: s, $options: "i" } },
        { "shippingAddress.phone": { $regex: s, $options: "i" } },
        ...(matchedUserIds.length > 0 ? [{ user: { $in: matchedUserIds } }] : [])
      ]
    });
  }

  if (andConditions.length === 1) {
    Object.assign(matchFilter, andConditions[0]);
  } else if (andConditions.length > 1) {
    matchFilter.$and = andConditions;
  }

  return matchFilter;
};

/**
 * Single authoritative source of truth for Dashboard analytics and future reports.
 *
 * Formulations:
 * - Gross Sales: Sum of finalAmount across qualifying finalized orders.
 * - Completed Refunds: Sum of refundAmount for orders with completed refund status.
 * - Net Sales: grossSales - completedRefunds (No double discount subtraction).
 * - Total Orders: Count of qualifying finalized orders.
 * - Units Sold: Net non-cancelled, non-returned item quantities across qualifying orders.
 * - Discounts & Savings: Sum of couponDiscount + totalOfferDiscount.
 * - Sales Trend: Daily (or monthly) net sales buckets with gap-filling.
 * - Payment Breakdown: Finalized order counts, amounts, percentages by paymentMethod.
 * - Top 10 Products: Ranked by units sold using historical OrderItem snapshots.
 */
export const getDashboardAnalytics = async ({ preset = "this_month", startDate = null, endDate = null } = {}) => {
  const dateRange = normalizeDateRange({ preset, startDate, endDate });
  const { startDate: start, endDate: end } = dateRange;

  const matchFilter = await buildQualifyingOrderMatch(start, end);

  // 1. KPI Aggregation (Gross Sales, Refunds, Discounts, Order Count)
  const [kpiAgg] = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        grossSales: { $sum: "$finalAmount" },
        totalDiscounts: { $sum: { $ifNull: ["$discount", 0] } },
        couponSavings: { $sum: { $ifNull: ["$couponDiscount", 0] } },
        offerSavings: { $sum: { $ifNull: ["$totalOfferDiscount", 0] } },
        completedRefunds: {
          $sum: {
            $cond: [
              { $in: ["$refundStatus", ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"]] },
              { $ifNull: ["$refundAmount", 0] },
              0
            ]
          }
        }
      }
    }
  ]);

  // 2. Units Sold Aggregation (Excludes cancelled or returned item quantities)
  const [unitsAgg] = await Order.aggregate([
    { $match: matchFilter },
    { $unwind: "$items" },
    {
      $match: {
        "items.itemStatus": { $nin: ["CANCELLED", "RETURNED"] }
      }
    },
    {
      $group: {
        _id: null,
        unitsSold: { $sum: "$items.quantity" }
      }
    }
  ]);

  const totalOrders = kpiAgg?.totalOrders || 0;
  const grossSales = Math.round((kpiAgg?.grossSales || 0) * 100) / 100;
  const completedRefunds = Math.round((kpiAgg?.completedRefunds || 0) * 100) / 100;
  const couponSavings = Math.round((kpiAgg?.couponSavings || 0) * 100) / 100;
  const offerSavings = Math.round((kpiAgg?.offerSavings || 0) * 100) / 100;
  const totalDiscounts = Math.round((couponSavings + offerSavings) * 100) / 100;
  const unitsSold = unitsAgg?.unitsSold || 0;
  const netSales = Math.max(0, Math.round((grossSales - completedRefunds) * 100) / 100);

  // 3. Chart 1 — Sales Trend Aggregation (Daily buckets in IST)
  const salesTrendRaw = await Order.aggregate([
    { $match: matchFilter },
    {
      $project: {
        dateStr: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$createdAt",
            timezone: TIMEZONE_IST
          }
        },
        finalAmount: 1,
        refundAmount: {
          $cond: [
            { $in: ["$refundStatus", ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"]] },
            { $ifNull: ["$refundAmount", 0] },
            0
          ]
        }
      }
    },
    {
      $group: {
        _id: "$dateStr",
        orderCount: { $sum: 1 },
        dayGross: { $sum: "$finalAmount" },
        dayRefunds: { $sum: "$refundAmount" }
      }
    },
    {
      $project: {
        period: "$_id",
        orderCount: 1,
        netSales: { $max: [0, { $subtract: ["$dayGross", "$dayRefunds"] }] }
      }
    },
    { $sort: { period: 1 } }
  ]);

  // Map raw data for rapid lookup
  const trendMap = new Map();
  salesTrendRaw.forEach((row) => {
    trendMap.set(row.period, {
      netSales: Math.round(row.netSales * 100) / 100,
      orderCount: row.orderCount
    });
  });

  // Gap-filling: Generate continuous dates between start and end
  const salesTrend = [];
  const startDay = new Date(dateRange.startDateStr + "T00:00:00.000+05:30");
  const endDay = new Date(dateRange.endDateStr + "T00:00:00.000+05:30");
  const diffDays = Math.round((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000));

  // If period is under 60 days, fill day-by-day
  if (diffDays <= 62) {
    const cur = new Date(startDay);
    while (cur <= endDay) {
      const year = cur.getFullYear();
      const month = String(cur.getMonth() + 1).padStart(2, "0");
      const day = String(cur.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;
      const entry = trendMap.get(dateKey) || { netSales: 0, orderCount: 0 };

      // Format short label (e.g., "01 Sep")
      const labelShort = cur.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

      salesTrend.push({
        period: dateKey,
        label: labelShort,
        netSales: entry.netSales,
        orderCount: entry.orderCount
      });

      cur.setDate(cur.getDate() + 1);
    }
  } else {
    // For longer periods, return data rows directly with nice labels
    salesTrendRaw.forEach((row) => {
      const [y, m, d] = row.period.split("-").map(Number);
      const rowDate = new Date(y, m - 1, d);
      salesTrend.push({
        period: row.period,
        label: rowDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        netSales: Math.round(row.netSales * 100) / 100,
        orderCount: row.orderCount
      });
    });
  }

  // 4. Chart 2 — Orders by Payment Method (Doughnut Chart)
  const paymentBreakdownRaw = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: "$paymentMethod",
        count: { $sum: 1 },
        amount: { $sum: "$finalAmount" }
      }
    }
  ]);

  const paymentMethodLabels = {
    COD: "Cash on Delivery (COD)",
    RAZORPAY: "Razorpay Online",
    WALLET: "Electryve Wallet"
  };

  const paymentBreakdown = ["COD", "RAZORPAY", "WALLET"].map((method) => {
    const found = paymentBreakdownRaw.find((p) => p._id === method);
    const count = found ? found.count : 0;
    const amount = found ? Math.round(found.amount * 100) / 100 : 0;
    const percentage = totalOrders > 0 ? Math.round((count / totalOrders) * 1000) / 10 : 0;
    return {
      method,
      label: paymentMethodLabels[method] || method,
      count,
      amount,
      percentage
    };
  });

  // 5. Chart 3 — Top 10 Products by Units Sold (Horizontal Bar Chart)
  // Authoritative: derived from historical OrderItem snapshots
  const topProducts = await Order.aggregate([
    { $match: matchFilter },
    { $unwind: "$items" },
    {
      $match: {
        "items.itemStatus": { $nin: ["CANCELLED", "RETURNED"] }
      }
    },
    {
      $group: {
        _id: {
          product: "$items.product",
          productName: "$items.productName"
        },
        productName: { $first: "$items.productName" },
        brandName: { $first: "$items.brandName" },
        sku: { $first: "$items.sku" },
        unitsSold: { $sum: "$items.quantity" },
        revenue: { $sum: "$items.itemTotal" }
      }
    },
    { $sort: { unitsSold: -1, revenue: -1 } },
    { $limit: 10 },
    {
      $project: {
        _id: 0,
        productName: 1,
        brandName: 1,
        sku: 1,
        unitsSold: 1,
        revenue: { $round: ["$revenue", 2] }
      }
    }
  ]);

  // 6. Top Categories (Ranked List/Table)
  // Resolves product category from historical order item references
  const topCategories = await Order.aggregate([
    { $match: matchFilter },
    { $unwind: "$items" },
    {
      $match: {
        "items.itemStatus": { $nin: ["CANCELLED", "RETURNED"] }
      }
    },
    {
      $lookup: {
        from: "products",
        localField: "items.product",
        foreignField: "_id",
        as: "productDoc"
      }
    },
    {
      $lookup: {
        from: "categories",
        localField: "productDoc.category",
        foreignField: "_id",
        as: "categoryDoc"
      }
    },
    {
      $group: {
        _id: { $ifNull: [{ $arrayElemAt: ["$categoryDoc.name", 0] }, "General"] },
        unitsSold: { $sum: "$items.quantity" },
        revenue: { $sum: "$items.itemTotal" }
      }
    },
    { $sort: { unitsSold: -1, revenue: -1 } },
    { $limit: 5 },
    {
      $project: {
        _id: 0,
        categoryName: "$_id",
        unitsSold: 1,
        revenue: { $round: ["$revenue", 2] }
      }
    }
  ]);

  // 7. Recent Orders Panel (Obeying dashboard filter range, latest 6 orders)
  const recentOrdersRaw = await Order.find(matchFilter)
    .populate("user", "fullName email")
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();

  const recentOrders = recentOrdersRaw.map((o) => ({
    _id: o._id,
    orderNumber: o.orderNumber,
    customerName: o.user?.fullName || o.shippingAddress?.fullName || "Guest",
    customerEmail: o.user?.email || "—",
    date: new Date(o.createdAt).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }),
    paymentMethod: o.paymentMethod,
    finalAmount: o.finalAmount,
    orderStatus: o.orderStatus
  }));

  // 8. Low Stock Alerts (Current operational inventory from Product model)
  const lowStockRaw = await Product.aggregate([
    { $match: { isDeleted: false } },
    { $unwind: "$variants" },
    {
      $match: {
        "variants.stock": { $lte: LOW_STOCK_THRESHOLD }
      }
    },
    {
      $project: {
        productId: "$_id",
        productName: "$name",
        variantId: "$variants._id",
        color: "$variants.color",
        storage: "$variants.storage",
        sku: "$variants.sku",
        stock: "$variants.stock",
        threshold: { $literal: LOW_STOCK_THRESHOLD },
        status: {
          $cond: [{ $lte: ["$variants.stock", 0] }, "Out of Stock", "Low Stock"]
        }
      }
    },
    { $sort: { stock: 1, productName: 1 } },
    { $limit: 6 }
  ]);

  // 9. Recent Refunds / Returns Activity
  const recentRefundsRaw = await Order.find({
    refundAmount: { $gt: 0 },
    refundStatus: { $in: ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"] },
    createdAt: { $gte: start, $lte: end }
  })
    .populate("user", "fullName email")
    .sort({ refundedAt: -1, updatedAt: -1 })
    .limit(5)
    .lean();

  const recentRefunds = recentRefundsRaw.map((r) => ({
    _id: r._id,
    orderNumber: r.orderNumber,
    customerName: r.user?.fullName || r.shippingAddress?.fullName || "Customer",
    refundAmount: r.refundAmount,
    refundMethod: r.refundMethod || "WALLET",
    refundDate: r.refundedAt
      ? new Date(r.refundedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : new Date(r.updatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    status: r.refundStatus
  }));

  return {
    success: true,
    period: {
      preset: dateRange.preset,
      startDate: dateRange.startDateStr,
      endDate: dateRange.endDateStr,
      label: dateRange.label
    },
    kpis: {
      netSales,
      grossSales,
      totalOrders,
      unitsSold,
      completedRefunds,
      totalDiscounts,
      couponSavings,
      offerSavings
    },
    salesTrend,
    paymentBreakdown,
    topProducts,
    topCategories,
    recentOrders,
    lowStock: lowStockRaw,
    recentRefunds
  };
};

/**
 * Authoritative summary KPIs for Sales Report.
 * Uses identical calculation rules as getDashboardAnalytics.
 */
export const getSalesReportSummary = async ({
  preset = "this_month",
  startDate = null,
  endDate = null,
  paymentMethod = "ALL",
  orderStatus = "ALL",
  search = ""
} = {}) => {
  const dateRange = normalizeDateRange({ preset, startDate, endDate });
  const { startDate: start, endDate: end } = dateRange;

  const matchFilter = await buildQualifyingOrderMatch(start, end, {
    paymentMethod,
    orderStatus,
    search
  });

  const [kpiAgg] = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        grossSales: { $sum: "$finalAmount" },
        totalDiscounts: { $sum: { $ifNull: ["$discount", 0] } },
        couponSavings: { $sum: { $ifNull: ["$couponDiscount", 0] } },
        offerSavings: { $sum: { $ifNull: ["$totalOfferDiscount", 0] } },
        completedRefunds: {
          $sum: {
            $cond: [
              { $in: ["$refundStatus", ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"]] },
              { $ifNull: ["$refundAmount", 0] },
              0
            ]
          }
        }
      }
    }
  ]);

  const [unitsAgg] = await Order.aggregate([
    { $match: matchFilter },
    { $unwind: "$items" },
    {
      $match: {
        "items.itemStatus": { $nin: ["CANCELLED", "RETURNED"] }
      }
    },
    {
      $group: {
        _id: null,
        unitsSold: { $sum: "$items.quantity" }
      }
    }
  ]);

  const totalOrders = kpiAgg?.totalOrders || 0;
  const grossSales = Math.round((kpiAgg?.grossSales || 0) * 100) / 100;
  const completedRefunds = Math.round((kpiAgg?.completedRefunds || 0) * 100) / 100;
  const couponSavings = Math.round((kpiAgg?.couponSavings || 0) * 100) / 100;
  const offerSavings = Math.round((kpiAgg?.offerSavings || 0) * 100) / 100;
  const totalDiscounts = Math.round((couponSavings + offerSavings) * 100) / 100;
  const unitsSold = unitsAgg?.unitsSold || 0;
  const netSales = Math.max(0, Math.round((grossSales - completedRefunds) * 100) / 100);

  return {
    success: true,
    period: {
      preset: dateRange.preset,
      startDate: dateRange.startDateStr,
      endDate: dateRange.endDateStr,
      label: dateRange.label
    },
    filters: {
      paymentMethod,
      orderStatus,
      search: search || ""
    },
    kpis: {
      netSales,
      grossSales,
      totalOrders,
      unitsSold,
      completedRefunds,
      totalDiscounts,
      couponSavings,
      offerSavings
    }
  };
};

/**
 * Grouped periodic sales aggregation for Sales Report.
 * Groups by 'day', 'month', 'year', or 'week'.
 */
export const getSalesReportGrouped = async ({
  preset = "this_month",
  startDate = null,
  endDate = null,
  paymentMethod = "ALL",
  orderStatus = "ALL",
  search = "",
  groupBy = null
} = {}) => {
  const dateRange = normalizeDateRange({ preset, startDate, endDate });
  const { startDate: start, endDate: end } = dateRange;

  const matchFilter = await buildQualifyingOrderMatch(start, end, {
    paymentMethod,
    orderStatus,
    search
  });

  const diffDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  let resolvedGroupBy = groupBy ? groupBy.toLowerCase().trim() : (diffDays <= 62 ? "day" : "month");
  if (!["day", "week", "month", "year"].includes(resolvedGroupBy)) {
    resolvedGroupBy = diffDays <= 62 ? "day" : "month";
  }

  let formatStr = "%Y-%m-%d";
  if (resolvedGroupBy === "month") formatStr = "%Y-%m";
  else if (resolvedGroupBy === "year") formatStr = "%Y";
  else if (resolvedGroupBy === "week") formatStr = "%Y-W%V";

  const groupedRaw = await Order.aggregate([
    { $match: matchFilter },
    {
      $project: {
        periodKey: {
          $dateToString: {
            format: formatStr,
            date: "$createdAt",
            timezone: TIMEZONE_IST
          }
        },
        finalAmount: 1,
        discount: { $ifNull: ["$discount", 0] },
        couponDiscount: { $ifNull: ["$couponDiscount", 0] },
        totalOfferDiscount: { $ifNull: ["$totalOfferDiscount", 0] },
        refundAmount: {
          $cond: [
            { $in: ["$refundStatus", ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"]] },
            { $ifNull: ["$refundAmount", 0] },
            0
          ]
        },
        netUnits: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: "$items",
                  as: "it",
                  cond: { $not: { $in: ["$$it.itemStatus", ["CANCELLED", "RETURNED"]] } }
                }
              },
              as: "it",
              in: "$$it.quantity"
            }
          }
        }
      }
    },
    {
      $group: {
        _id: "$periodKey",
        orderCount: { $sum: 1 },
        unitsSold: { $sum: "$netUnits" },
        grossSales: { $sum: "$finalAmount" },
        totalDiscounts: { $sum: "$discount" },
        couponSavings: { $sum: "$couponDiscount" },
        offerSavings: { $sum: "$totalOfferDiscount" },
        completedRefunds: { $sum: "$refundAmount" }
      }
    },
    { $sort: { _id: -1 } }
  ]);

  const rows = groupedRaw.map((row) => {
    const gross = Math.round(row.grossSales * 100) / 100;
    const refunds = Math.round(row.completedRefunds * 100) / 100;
    const net = Math.max(0, Math.round((gross - refunds) * 100) / 100);
    const couponDisc = Math.round(row.couponSavings * 100) / 100;
    const offerDisc = Math.round(row.offerSavings * 100) / 100;
    const totalDisc = Math.round((couponDisc + offerDisc) * 100) / 100;

    let displayLabel = row._id;
    if (resolvedGroupBy === "day") {
      const [y, m, d] = row._id.split("-").map(Number);
      displayLabel = new Date(y, m - 1, d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
    } else if (resolvedGroupBy === "month") {
      const [y, m] = row._id.split("-").map(Number);
      displayLabel = new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric"
      });
    } else if (resolvedGroupBy === "week") {
      displayLabel = `Week ${row._id}`;
    }

    return {
      periodKey: row._id,
      label: displayLabel,
      orderCount: row.orderCount,
      unitsSold: row.unitsSold,
      grossSales: gross,
      couponSavings: couponDisc,
      offerSavings: offerDisc,
      totalDiscounts: totalDisc,
      completedRefunds: refunds,
      netSales: net
    };
  });

  return {
    success: true,
    groupBy: resolvedGroupBy,
    rows
  };
};

/**
 * Detailed paginated order records for Sales Report.
 */
export const getSalesReportDetails = async ({
  preset = "this_month",
  startDate = null,
  endDate = null,
  paymentMethod = "ALL",
  orderStatus = "ALL",
  search = "",
  page = 1,
  limit = 10,
  sortBy = "createdAt",
  sortOrder = "desc"
} = {}) => {
  const dateRange = normalizeDateRange({ preset, startDate, endDate });
  const { startDate: start, endDate: end } = dateRange;

  const matchFilter = await buildQualifyingOrderMatch(start, end, {
    paymentMethod,
    orderStatus,
    search
  });

  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const pageLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (currentPage - 1) * pageLimit;

  const validSortFields = ["createdAt", "finalAmount", "orderNumber"];
  const resolvedSortBy = validSortFields.includes(sortBy) ? sortBy : "createdAt";
  const sortDirection = sortOrder === "asc" ? 1 : -1;

  const [totalOrders, ordersRaw] = await Promise.all([
    Order.countDocuments(matchFilter),
    Order.find(matchFilter)
      .populate("user", "fullName email phone")
      .populate("coupon", "code discountType discountValue")
      .sort({ [resolvedSortBy]: sortDirection })
      .skip(skip)
      .limit(pageLimit)
      .lean()
  ]);

  const orders = ordersRaw.map((order) => {
    const isRefundCompleted = ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(order.refundStatus);
    const refundDeduction = isRefundCompleted ? (order.refundAmount || 0) : 0;
    const netAmount = Math.max(0, Math.round((order.finalAmount - refundDeduction) * 100) / 100);

    const netUnits = (order.items || []).reduce((acc, item) => {
      if (item.itemStatus !== "CANCELLED" && item.itemStatus !== "RETURNED") {
        return acc + (item.quantity || 0);
      }
      return acc;
    }, 0);

    return {
      _id: order._id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      formattedDate: new Date(order.createdAt).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }),
      customerName: order.user?.fullName || order.shippingAddress?.fullName || "Customer",
      customerEmail: order.user?.email || "—",
      customerPhone: order.shippingAddress?.phone || order.user?.phone || "—",
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee || 0,
      grossSales: order.finalAmount,
      totalDiscounts: Math.round(((order.couponDiscount || 0) + (order.totalOfferDiscount || 0)) * 100) / 100,
      couponSavings: order.couponDiscount || 0,
      offerSavings: order.totalOfferDiscount || 0,
      couponCode: order.couponSnapshot?.code || order.coupon?.code || null,
      refundAmount: order.refundAmount || 0,
      refundStatus: order.refundStatus,
      refundMethod: order.refundMethod || "WALLET",
      netSales: netAmount,
      unitsCount: netUnits,
      itemsCount: (order.items || []).length,
      items: (order.items || []).map((item) => ({
        productName: item.productName,
        brandName: item.brandName,
        variantDetails: item.variantDetails,
        sku: item.sku,
        image: item.image,
        quantity: item.quantity,
        regularPrice: item.regularPrice,
        salePrice: item.salePrice,
        offerDiscount: item.offerDiscount,
        appliedOfferName: item.appliedOfferName,
        itemTotal: item.itemTotal,
        itemStatus: item.itemStatus,
        returnRequestStatus: item.returnRequest?.status || "NONE"
      }))
    };
  });

  const totalPages = Math.ceil(totalOrders / pageLimit) || 1;

  return {
    success: true,
    orders,
    pagination: {
      page: currentPage,
      limit: pageLimit,
      totalOrders,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1
    }
  };
};

/**
 * Retrieves all qualifying orders for PDF and Excel export (up to 5000 records).
 */
export const getAllSalesReportOrders = async ({
  preset = "this_month",
  startDate = null,
  endDate = null,
  paymentMethod = "ALL",
  orderStatus = "ALL",
  search = "",
  groupBy = null
} = {}) => {
  const [summary, grouped, details] = await Promise.all([
    getSalesReportSummary({ preset, startDate, endDate, paymentMethod, orderStatus, search }),
    getSalesReportGrouped({ preset, startDate, endDate, paymentMethod, orderStatus, search, groupBy }),
    getSalesReportDetails({ preset, startDate, endDate, paymentMethod, orderStatus, search, page: 1, limit: 5000 })
  ]);

  return {
    summary,
    grouped,
    orders: details.orders
  };
};
