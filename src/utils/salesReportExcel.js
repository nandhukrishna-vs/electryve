import ExcelJS from "exceljs";

/**
 * Generates a comprehensive 4-sheet Excel sales workbook and returns a Buffer.
 *
 * Sheets:
 * 1. Summary: Metadata, applied filters, and 6 authoritative KPI totals.
 * 2. Grouped Sales: Periodic performance (day/month/year).
 * 3. Detailed Orders: Full order-level financial and customer breakdown.
 * 4. Item Breakdown: Granular line-item snapshots.
 *
 * @param {Object} data
 * @param {Object} data.summary - KPI summary object
 * @param {Object} data.grouped - Grouped periodic data
 * @param {Array} data.orders - Array of detailed order records
 * @returns {Promise<Buffer>}
 */
export const generateSalesReportExcel = async ({ summary, grouped, orders = [] }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Electryve E-Commerce";
  workbook.lastModifiedBy = "Electryve Authoritative Report Engine";
  workbook.created = new Date();
  workbook.modified = new Date();

  const kpis = summary?.kpis || {};
  const period = summary?.period || {};
  const filters = summary?.filters || {};
  const currencyFmt = '"₹"#,##0.00';
  const integerFmt = '#,##0';

  const headerFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E293B" } // Dark Slate
  };

  const headerFont = {
    name: "Segoe UI",
    size: 10,
    bold: true,
    color: { argb: "FFFFFFFF" }
  };

  // ==========================================
  // SHEET 1: Summary & Metadata
  // ==========================================
  const summarySheet = workbook.addWorksheet("Summary", {
    views: [{ showGridLines: true }]
  });

  summarySheet.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 36 },
    { header: "Description / Breakdown", key: "desc", width: 45 }
  ];

  // Title block
  summarySheet.mergeCells("A1:C1");
  const titleCell = summarySheet.getCell("A1");
  titleCell.value = "ELECTRYVE — EXECUTIVE SALES & REVENUE REPORT";
  titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  summarySheet.getRow(1).height = 36;

  // Metadata block
  const metaRows = [
    ["Generated At", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST", "Authoritative reportService export"],
    ["Date Range Preset", (period.preset || "this_month").toUpperCase(), period.label || "Custom"],
    ["Period Boundaries", `${period.startDate || "—"} to ${period.endDate || "—"}`, "Timezone: Asia/Kolkata (+05:30)"],
    ["Payment Filter", filters.paymentMethod || "ALL", "Qualifying completed/paid orders"],
    ["Order Status Filter", filters.orderStatus || "ALL", "Realized sales orders"],
    ["Customer/Order Search", filters.search || "None", "Applied search query"]
  ];

  summarySheet.addRow([]); // Blank row
  const metaHeaderRow = summarySheet.addRow(["REPORT METADATA", "CONFIGURATION", "NOTES"]);
  metaHeaderRow.font = headerFont;
  metaHeaderRow.eachCell((cell) => { cell.fill = headerFill; });

  metaRows.forEach((r) => summarySheet.addRow(r));

  // Financial KPIs block
  summarySheet.addRow([]); // Blank row
  const kpiHeaderRow = summarySheet.addRow(["KPI METRIC", "AUTHORITATIVE TOTAL", "FINANCIAL FORMULATION"]);
  kpiHeaderRow.font = headerFont;
  kpiHeaderRow.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } }; });

  const kpiData = [
    { metric: "Net Sales", val: kpis.netSales || 0, fmt: currencyFmt, note: "Gross Sales minus Completed Refunds (Authoritative revenue)" },
    { metric: "Gross Sales", val: kpis.grossSales || 0, fmt: currencyFmt, note: "Sum of finalAmount across qualifying finalized orders" },
    { metric: "Total Orders", val: kpis.totalOrders || 0, fmt: integerFmt, note: "Count of finalized realized sales orders" },
    { metric: "Units Sold", val: kpis.unitsSold || 0, fmt: integerFmt, note: "Net non-cancelled, non-returned physical units" },
    { metric: "Completed Refunds", val: kpis.completedRefunds || 0, fmt: currencyFmt, note: "Sum of refunds for orders with completed refund status" },
    { metric: "Total Discounts Given", val: kpis.totalDiscounts || 0, fmt: currencyFmt, note: "Combined Coupon and Offer savings" },
    { metric: "↳ Coupon Savings", val: kpis.couponSavings || 0, fmt: currencyFmt, note: "Deductions granted via promotional coupons" },
    { metric: "↳ Product & Category Offer Savings", val: kpis.offerSavings || 0, fmt: currencyFmt, note: "Direct product/category/referral offer deductions" }
  ];

  kpiData.forEach((k) => {
    const row = summarySheet.addRow([k.metric, k.val, k.note]);
    row.getCell(2).numFmt = k.fmt;
    row.getCell(1).font = { bold: true, name: "Segoe UI", size: 10 };
    if (k.metric === "Net Sales") {
      row.font = { bold: true, color: { argb: "FF059669" } };
    }
  });

  // ==========================================
  // SHEET 2: Grouped Sales
  // ==========================================
  const groupedSheet = workbook.addWorksheet("Grouped Sales", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: true }]
  });

  groupedSheet.columns = [
    { header: "Period Key", key: "periodKey", width: 14 },
    { header: "Period Label", key: "label", width: 18 },
    { header: "Orders", key: "orderCount", width: 12 },
    { header: "Units Sold", key: "unitsSold", width: 12 },
    { header: "Gross Sales", key: "grossSales", width: 18 },
    { header: "Coupon Savings", key: "couponSavings", width: 16 },
    { header: "Offer Savings", key: "offerSavings", width: 16 },
    { header: "Total Discounts", key: "totalDiscounts", width: 16 },
    { header: "Refunds", key: "completedRefunds", width: 16 },
    { header: "Net Sales", key: "netSales", width: 20 }
  ];

  groupedSheet.getRow(1).font = headerFont;
  groupedSheet.getRow(1).eachCell((cell) => { cell.fill = headerFill; });
  groupedSheet.autoFilter = "A1:J1";

  const groupedRows = grouped?.rows || [];
  groupedRows.forEach((r) => {
    const row = groupedSheet.addRow({
      periodKey: r.periodKey,
      label: r.label,
      orderCount: r.orderCount,
      unitsSold: r.unitsSold,
      grossSales: r.grossSales,
      couponSavings: r.couponSavings,
      offerSavings: r.offerSavings,
      totalDiscounts: r.totalDiscounts,
      completedRefunds: r.completedRefunds,
      netSales: r.netSales
    });

    row.getCell(3).numFmt = integerFmt;
    row.getCell(4).numFmt = integerFmt;
    row.getCell(5).numFmt = currencyFmt;
    row.getCell(6).numFmt = currencyFmt;
    row.getCell(7).numFmt = currencyFmt;
    row.getCell(8).numFmt = currencyFmt;
    row.getCell(9).numFmt = currencyFmt;
    row.getCell(10).numFmt = currencyFmt;
  });

  // ==========================================
  // SHEET 3: Detailed Orders
  // ==========================================
  const detailsSheet = workbook.addWorksheet("Detailed Orders", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: true }]
  });

  detailsSheet.columns = [
    { header: "Order #", key: "orderNumber", width: 18 },
    { header: "Order Date", key: "orderDate", width: 20 },
    { header: "Customer Name", key: "customerName", width: 24 },
    { header: "Customer Email", key: "customerEmail", width: 28 },
    { header: "Customer Phone", key: "customerPhone", width: 16 },
    { header: "Payment Method", key: "paymentMethod", width: 16 },
    { header: "Payment Status", key: "paymentStatus", width: 16 },
    { header: "Order Status", key: "orderStatus", width: 16 },
    { header: "Net Units", key: "unitsCount", width: 12 },
    { header: "Items Count", key: "itemsCount", width: 12 },
    { header: "Subtotal", key: "subtotal", width: 16 },
    { header: "Shipping Fee", key: "shippingFee", width: 14 },
    { header: "Gross Sales", key: "grossSales", width: 18 },
    { header: "Coupon Code", key: "couponCode", width: 16 },
    { header: "Coupon Savings", key: "couponSavings", width: 16 },
    { header: "Offer Savings", key: "offerSavings", width: 16 },
    { header: "Total Discounts", key: "totalDiscounts", width: 16 },
    { header: "Refund Amount", key: "refundAmount", width: 16 },
    { header: "Refund Status", key: "refundStatus", width: 16 },
    { header: "Net Sales", key: "netSales", width: 20 }
  ];

  detailsSheet.getRow(1).font = headerFont;
  detailsSheet.getRow(1).eachCell((cell) => { cell.fill = headerFill; });
  detailsSheet.autoFilter = "A1:T1";

  orders.forEach((ord) => {
    const row = detailsSheet.addRow({
      orderNumber: ord.orderNumber,
      orderDate: ord.formattedDate || new Date(ord.createdAt).toISOString(),
      customerName: ord.customerName,
      customerEmail: ord.customerEmail,
      customerPhone: ord.customerPhone,
      paymentMethod: ord.paymentMethod,
      paymentStatus: ord.paymentStatus,
      orderStatus: ord.orderStatus,
      unitsCount: ord.unitsCount,
      itemsCount: ord.itemsCount,
      subtotal: ord.subtotal,
      shippingFee: ord.shippingFee,
      grossSales: ord.grossSales,
      couponCode: ord.couponCode || "—",
      couponSavings: ord.couponSavings,
      offerSavings: ord.offerSavings,
      totalDiscounts: ord.totalDiscounts,
      refundAmount: ord.refundAmount,
      refundStatus: ord.refundStatus,
      netSales: ord.netSales
    });

    row.getCell(9).numFmt = integerFmt;
    row.getCell(10).numFmt = integerFmt;
    row.getCell(11).numFmt = currencyFmt;
    row.getCell(12).numFmt = currencyFmt;
    row.getCell(13).numFmt = currencyFmt;
    row.getCell(15).numFmt = currencyFmt;
    row.getCell(16).numFmt = currencyFmt;
    row.getCell(17).numFmt = currencyFmt;
    row.getCell(18).numFmt = currencyFmt;
    row.getCell(20).numFmt = currencyFmt;
  });

  // ==========================================
  // SHEET 4: Item Breakdown
  // ==========================================
  const itemsSheet = workbook.addWorksheet("Item Breakdown", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: true }]
  });

  itemsSheet.columns = [
    { header: "Order #", key: "orderNumber", width: 18 },
    { header: "Order Date", key: "orderDate", width: 18 },
    { header: "Customer Name", key: "customerName", width: 22 },
    { header: "Product Name", key: "productName", width: 30 },
    { header: "Brand", key: "brandName", width: 18 },
    { header: "Variant Details", key: "variantDetails", width: 22 },
    { header: "SKU", key: "sku", width: 16 },
    { header: "Quantity", key: "quantity", width: 10 },
    { header: "Regular Price", key: "regularPrice", width: 16 },
    { header: "Sale Price", key: "salePrice", width: 16 },
    { header: "Offer Discount", key: "offerDiscount", width: 16 },
    { header: "Applied Offer", key: "appliedOfferName", width: 22 },
    { header: "Item Total", key: "itemTotal", width: 18 },
    { header: "Item Status", key: "itemStatus", width: 14 },
    { header: "Return Status", key: "returnRequestStatus", width: 16 }
  ];

  itemsSheet.getRow(1).font = headerFont;
  itemsSheet.getRow(1).eachCell((cell) => { cell.fill = headerFill; });
  itemsSheet.autoFilter = "A1:O1";

  orders.forEach((ord) => {
    (ord.items || []).forEach((it) => {
      const row = itemsSheet.addRow({
        orderNumber: ord.orderNumber,
        orderDate: (ord.formattedDate || "").split(",")[0],
        customerName: ord.customerName,
        productName: it.productName,
        brandName: it.brandName,
        variantDetails: it.variantDetails,
        sku: it.sku || "—",
        quantity: it.quantity,
        regularPrice: it.regularPrice,
        salePrice: it.salePrice,
        offerDiscount: it.offerDiscount || 0,
        appliedOfferName: it.appliedOfferName || "—",
        itemTotal: it.itemTotal,
        itemStatus: it.itemStatus,
        returnRequestStatus: it.returnRequestStatus || "NONE"
      });

      row.getCell(8).numFmt = integerFmt;
      row.getCell(9).numFmt = currencyFmt;
      row.getCell(10).numFmt = currencyFmt;
      row.getCell(11).numFmt = currencyFmt;
      row.getCell(13).numFmt = currencyFmt;
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};
