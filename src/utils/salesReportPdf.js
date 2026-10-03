import PDFDocument from "pdfkit";
import fs from "fs";
import { formatOrderStatus } from "./orderStatusFormatter.js";

// Determine system font availability for INR symbol (₹)
const SEGOE_REGULAR = "C:/Windows/Fonts/segoeui.ttf";
const SEGOE_BOLD = "C:/Windows/Fonts/segoeuib.ttf";
const hasSegoe = fs.existsSync(SEGOE_REGULAR) && fs.existsSync(SEGOE_BOLD);

/**
 * Formats payment method for executive display while preserving backend values.
 */
const formatPaymentMethod = (method) => {
  const m = String(method || "COD").toUpperCase();
  if (m === "RAZORPAY") return "Razorpay";
  if (m === "WALLET") return "Wallet";
  if (m === "COD") return "COD";
  return m;
};

/**
 * Formats payment status for executive display.
 */
const formatPaymentStatus = (status) => {
  const s = String(status || "PENDING").toUpperCase();
  if (s === "PAID" || s === "COMPLETED") return "Paid";
  if (s === "REFUNDED") return "Refunded";
  if (s === "FAILED") return "Failed";
  return "Pending";
};

/**
 * Generates an authoritative, professional A4 Landscape PDF Sales Report
 * whose data coverage matches the 4-sheet Excel export.
 *
 * @param {Object} data
 * @param {Object} data.summary - Authoritative KPI summary and metadata
 * @param {Object} data.grouped - Grouped periodic sales data
 * @param {Array} data.orders - Array of detailed qualifying order records
 * @returns {Promise<Buffer>}
 */
export const generateSalesReportPdf = async ({ summary, grouped, orders = [] }) => {
  return new Promise((resolve, reject) => {
    try {
      // Landscape A4: 841.89 x 595.28 points
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 30,
        bufferPages: true
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      const fontRegular = hasSegoe ? "SegoeUI" : "Helvetica";
      const fontBold = hasSegoe ? "SegoeUI-Bold" : "Helvetica-Bold";
      const rupeeSymbol = hasSegoe ? "₹" : "Rs. ";

      if (hasSegoe) {
        doc.registerFont("SegoeUI", SEGOE_REGULAR);
        doc.registerFont("SegoeUI-Bold", SEGOE_BOLD);
      }

      const formatINR = (val) => {
        const n = Number(val) || 0;
        return `${rupeeSymbol}${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      };

      const pageWidth = 782; // 841.89 - 30*2 = 781.89 -> 782 pt
      const leftMargin = 30;
      const maxY = 536; // Maximum safe Y coordinate before page break (page height 595.28)

      // ==========================================
      // 1. PAGE HEADER BANNER
      // ==========================================
      doc.rect(leftMargin, 30, pageWidth, 42).fill("#0f172a");
      doc.font(fontBold).fontSize(15).fillColor("#ffffff").text("ELECTRYVE", leftMargin + 16, 40, { continued: true });
      doc.font(fontRegular).fontSize(9.5).fillColor("#94a3b8").text("  |  EXECUTIVE SALES & REVENUE REPORT");

      const generatedTimeStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      doc.font(fontRegular).fontSize(7.5).fillColor("#cbd5e1").text(
        `Generated: ${generatedTimeStr} IST   •   Timezone: Asia/Kolkata (+05:30)`,
        leftMargin + 16,
        57
      );

      // ==========================================
      // 2. METADATA & APPLIED FILTERS BOX
      // ==========================================
      const metaY = 78;
      doc.rect(leftMargin, metaY, pageWidth, 32).fillAndStroke("#f8fafc", "#e2e8f0");

      const kpis = summary?.kpis || {};
      const period = summary?.period || {};
      const filters = summary?.filters || {};

      const statusFilterLabel = (!filters.orderStatus || filters.orderStatus === "ALL")
        ? "All Statuses"
        : formatOrderStatus(filters.orderStatus);

      doc.font(fontBold).fontSize(7.5).fillColor("#334155").text("Date Range Preset:", leftMargin + 10, metaY + 6, { continued: true });
      doc.font(fontRegular).fillColor("#475569").text(` ${(period.preset || "custom").toUpperCase()}  •  Period: ${period.label || "Custom"} (${period.startDate || "—"} to ${period.endDate || "—"})`);

      doc.font(fontBold).fontSize(7.5).fillColor("#334155").text("Applied Filters:", leftMargin + 10, metaY + 18, { continued: true });
      doc.font(fontRegular).fillColor("#475569").text(
        ` Payment: ${filters.paymentMethod || "ALL"}   •   Status: ${statusFilterLabel}   •   Group By: ${(grouped?.groupBy || "day").toUpperCase()}${filters.search ? `   •   Search: "${filters.search}"` : ""}`
      );

      // ==========================================
      // 3. EXECUTIVE FINANCIAL SUMMARY (8 KPI CARDS)
      // Matches Sheet 1 (Summary) authoritative metrics
      // ==========================================
      const kpiStartY = 118;
      doc.font(fontBold).fontSize(9).fillColor("#0f172a").text("EXECUTIVE FINANCIAL SUMMARY", leftMargin, kpiStartY);

      const cardW = 188; // (782 - 3*10) / 4 = 188 pt
      const cardH = 38;
      const cardRow1Y = 132;
      const cardRow2Y = 176;

      const summaryCards = [
        // Row 1
        { title: "NET SALES", value: formatINR(kpis.netSales), color: "#059669", sub: "Gross minus completed refunds", x: leftMargin, y: cardRow1Y },
        { title: "GROSS SALES", value: formatINR(kpis.grossSales), color: "#2563eb", sub: "Realized sales volume", x: leftMargin + (cardW + 10), y: cardRow1Y },
        { title: "TOTAL ORDERS", value: String(kpis.totalOrders || 0), color: "#0f172a", sub: "Qualifying finalized orders", x: leftMargin + 2 * (cardW + 10), y: cardRow1Y },
        { title: "UNITS SOLD", value: String(kpis.unitsSold || 0), color: "#0891b2", sub: "Net physical units fulfilled", x: leftMargin + 3 * (cardW + 10), y: cardRow1Y },
        // Row 2
        { title: "TOTAL REFUNDS", value: formatINR(kpis.completedRefunds), color: "#dc2626", sub: "Completed refund deductions", x: leftMargin, y: cardRow2Y },
        { title: "TOTAL DISCOUNTS", value: formatINR(kpis.totalDiscounts), color: "#d97706", sub: "Combined coupon & offer savings", x: leftMargin + (cardW + 10), y: cardRow2Y },
        { title: "COUPON SAVINGS", value: formatINR(kpis.couponSavings), color: "#7c3aed", sub: "Promotional coupon deductions", x: leftMargin + 2 * (cardW + 10), y: cardRow2Y },
        { title: "OFFER SAVINGS", value: formatINR(kpis.offerSavings), color: "#0d9488", sub: "Product & category offer savings", x: leftMargin + 3 * (cardW + 10), y: cardRow2Y }
      ];

      summaryCards.forEach((card) => {
        doc.rect(card.x, card.y, cardW, cardH).fillAndStroke("#f1f5f9", "#cbd5e1");
        doc.font(fontBold).fontSize(6.5).fillColor("#64748b").text(card.title, card.x + 8, card.y + 4);
        doc.font(fontBold).fontSize(10).fillColor(card.color).text(card.value, card.x + 8, card.y + 14);
        doc.font(fontRegular).fontSize(6).fillColor("#64748b").text(card.sub, card.x + 8, card.y + 26, { width: cardW - 16, lineBreak: false, ellipsis: true });
      });

      let currentY = cardRow2Y + cardH + 14; // ~228 pt

      // ==========================================
      // 4. PERIODIC PERFORMANCE TABLE
      // Matches Sheet 2 (Grouped Sales) columns 1-to-1:
      // Period Key, Period Label, Orders, Units Sold, Gross Sales,
      // Coupon Savings, Offer Savings, Total Discounts, Refunds, Net Sales
      // ==========================================
      const groupedRows = grouped?.rows || [];
      const gCols = [
        { header: "Period Key", width: 62, align: "left" },
        { header: "Period Label", width: 80, align: "left" },
        { header: "Orders", width: 45, align: "right" },
        { header: "Units Sold", width: 50, align: "right" },
        { header: "Gross Sales", width: 85, align: "right" },
        { header: "Coupon Savings", width: 85, align: "right" },
        { header: "Offer Savings", width: 85, align: "right" },
        { header: "Total Discounts", width: 85, align: "right" },
        { header: "Refunds", width: 90, align: "right" },
        { header: "Net Sales", width: 115, align: "right" }
      ]; // Sum: 62+80+45+50+85+85+85+85+90+115 = 782 pt

      const drawGroupedHeader = (y) => {
        doc.rect(leftMargin, y, pageWidth, 16).fill("#1e293b");
        let curX = leftMargin;
        gCols.forEach((col) => {
          doc.font(fontBold).fontSize(7).fillColor("#ffffff").text(col.header, curX + 4, y + 4.5, {
            width: col.width - 8,
            align: col.align,
            lineBreak: false
          });
          curX += col.width;
        });
        return y + 16;
      };

      doc.font(fontBold).fontSize(9).fillColor("#0f172a").text(`PERIODIC PERFORMANCE (${(grouped?.groupBy || "day").toUpperCase()} BREAKDOWN)`, leftMargin, currentY);
      currentY += 13;

      if (groupedRows.length === 0) {
        currentY = drawGroupedHeader(currentY);
        doc.rect(leftMargin, currentY, pageWidth, 16).fill("#f8fafc");
        doc.font(fontRegular).fontSize(7).fillColor("#64748b").text("No periodic sales activity recorded for this period.", leftMargin, currentY + 4.5, {
          width: pageWidth,
          align: "center",
          lineBreak: false
        });
        currentY += 24;
      } else {
        currentY = drawGroupedHeader(currentY);

        groupedRows.forEach((row, rIdx) => {
          if (currentY + 15 > maxY) {
            doc.addPage();
            currentY = 30;
            currentY = drawGroupedHeader(currentY);
          }

          const bgColor = rIdx % 2 === 0 ? "#ffffff" : "#f8fafc";
          doc.rect(leftMargin, currentY, pageWidth, 15).fill(bgColor);

          let curX = leftMargin;
          const vals = [
            row.periodKey || "—",
            row.label || row.periodKey || "—",
            String(row.orderCount || 0),
            String(row.unitsSold || 0),
            formatINR(row.grossSales),
            formatINR(row.couponSavings),
            formatINR(row.offerSavings),
            formatINR(row.totalDiscounts),
            formatINR(row.completedRefunds),
            formatINR(row.netSales)
          ];

          vals.forEach((txt, cIdx) => {
            const isNet = cIdx === 9;
            const isGross = cIdx === 4;
            const isRefund = cIdx === 8;
            let textColor = "#334155";
            if (isNet) textColor = "#059669";
            else if (isGross) textColor = "#2563eb";
            else if (isRefund) textColor = "#dc2626";

            doc.font(isNet || isGross ? fontBold : fontRegular).fontSize(6.5).fillColor(textColor).text(txt, curX + 4, currentY + 4, {
              width: gCols[cIdx].width - 8,
              align: gCols[cIdx].align,
              lineBreak: false,
              ellipsis: true
            });
            curX += gCols[cIdx].width;
          });

          currentY += 15;
        });

        currentY += 14;
      }

      // ==========================================
      // 5. DETAILED ORDERS TABLE
      // Matches Sheet 3 (Detailed Orders) columns 1-to-1 with complete data coverage:
      // Order #, Date, Customer Name, Email, Phone, Payment Method, Payment Status,
      // Order Status, Net Units, Items Count, Subtotal, Shipping Fee, Gross Sales,
      // Coupon Code, Coupon Savings, Offer Savings, Total Discounts,
      // Refund Amount, Refund Status, Net Sales
      // ==========================================
      const minRequiredDetailedHeight = orders.length === 0 ? 49 : 53;
      if (currentY + minRequiredDetailedHeight > maxY) {
        doc.addPage();
        currentY = 30;
      }

      doc.font(fontBold).fontSize(9).fillColor("#0f172a").text(`DETAILED ORDERS LIST (${orders.length} Records)`, leftMargin, currentY);
      currentY += 13;

      // 13 Highly Structured Columns summing exactly to 782 pt
      const dCols = [
        { header: "Order # / Date", width: 76, align: "left" },
        { header: "Customer / Contact", width: 108, align: "left" },
        { header: "Payment / Status", width: 64, align: "left" },
        { header: "Order Status", width: 68, align: "left" },
        { header: "Units", width: 30, align: "right" },
        { header: "Subtotal", width: 54, align: "right" },
        { header: "Shipping", width: 40, align: "right" },
        { header: "Gross Sales", width: 56, align: "right" },
        { header: "Coupon (Code)", width: 60, align: "right" },
        { header: "Offer Savings", width: 54, align: "right" },
        { header: "Total Disc.", width: 56, align: "right" },
        { header: "Refunds (Stat)", width: 60, align: "right" },
        { header: "Net Sales", width: 56, align: "right" }
      ]; // Sum: 76+108+64+68+30+54+40+56+60+54+56+60+56 = 782 pt

      const drawDetailsHeader = (y) => {
        doc.rect(leftMargin, y, pageWidth, 18).fill("#334155");
        let curX = leftMargin;
        dCols.forEach((col) => {
          doc.font(fontBold).fontSize(7).fillColor("#ffffff").text(col.header, curX + 4, y + 5.5, {
            width: col.width - 8,
            align: col.align,
            lineBreak: false
          });
          curX += col.width;
        });
        return y + 18;
      };

      if (orders.length === 0) {
        currentY = drawDetailsHeader(currentY);
        doc.rect(leftMargin, currentY, pageWidth, 18).fill("#f8fafc");
        doc.font(fontRegular).fontSize(7.5).fillColor("#64748b").text("No matching order records found for the selected period/filters.", leftMargin, currentY + 5.5, {
          width: pageWidth,
          align: "center",
          lineBreak: false
        });
        currentY += 26;
      } else {
        currentY = drawDetailsHeader(currentY);

        orders.forEach((ord, rIdx) => {
          const rowHeight = 22; // Generous 2-line row height for detailed fields
          if (currentY + rowHeight > maxY) {
            doc.addPage();
            currentY = 30;
            currentY = drawDetailsHeader(currentY);
          }

          const bgColor = rIdx % 2 === 0 ? "#ffffff" : "#f8fafc";
          doc.rect(leftMargin, currentY, pageWidth, rowHeight).fill(bgColor);

          // Subtle bottom divider line
          doc.moveTo(leftMargin, currentY + rowHeight).lineTo(leftMargin + pageWidth, currentY + rowHeight).strokeColor("#e2e8f0").stroke();

          // Prepare 2-line cell data representing all 20 Excel fields
          const cellRows = [
            // 1. Order # / Date
            {
              top: ord.orderNumber || "—",
              sub: (ord.formattedDate || "").split(",")[0] || "—",
              topFont: fontBold,
              topColor: "#0f172a"
            },
            // 2. Customer / Contact (Name & Email / Phone)
            {
              top: (ord.customerName || "Customer").substring(0, 18),
              sub: `${(ord.customerEmail || "—").substring(0, 16)} • ${(ord.customerPhone || "—").substring(0, 10)}`,
              topFont: fontBold,
              topColor: "#1e293b"
            },
            // 3. Payment Method & Payment Status
            {
              top: formatPaymentMethod(ord.paymentMethod),
              sub: formatPaymentStatus(ord.paymentStatus),
              topFont: fontRegular,
              topColor: "#334155",
              subFont: fontBold,
              subColor: ["PAID", "COMPLETED"].includes(String(ord.paymentStatus).toUpperCase()) ? "#059669" : "#d97706"
            },
            // 4. Order Status & Items Count
            {
              top: formatOrderStatus(ord.orderStatus),
              sub: `${ord.itemsCount || 1} item${(ord.itemsCount || 1) > 1 ? "s" : ""}`,
              topFont: fontBold,
              topColor: "#0f172a"
            },
            // 5. Units (Net Units)
            {
              top: String(ord.unitsCount || 0),
              sub: "",
              topFont: fontBold,
              topColor: "#0f172a"
            },
            // 6. Subtotal
            {
              top: formatINR(ord.subtotal),
              sub: "",
              topFont: fontRegular,
              topColor: "#475569"
            },
            // 7. Shipping Fee
            {
              top: Number(ord.shippingFee) > 0 ? formatINR(ord.shippingFee) : "FREE",
              sub: "",
              topFont: fontRegular,
              topColor: "#64748b"
            },
            // 8. Gross Sales
            {
              top: formatINR(ord.grossSales),
              sub: "",
              topFont: fontBold,
              topColor: "#2563eb"
            },
            // 9. Coupon Savings & Coupon Code
            {
              top: formatINR(ord.couponSavings),
              sub: ord.couponCode ? `[${ord.couponCode}]` : "—",
              topFont: fontRegular,
              topColor: "#7c3aed",
              subColor: "#7c3aed"
            },
            // 10. Offer Savings
            {
              top: formatINR(ord.offerSavings),
              sub: "",
              topFont: fontRegular,
              topColor: "#0d9488"
            },
            // 11. Total Discounts
            {
              top: formatINR(ord.totalDiscounts),
              sub: "",
              topFont: fontBold,
              topColor: "#d97706"
            },
            // 12. Refunds & Refund Status
            {
              top: formatINR(ord.refundAmount),
              sub: Number(ord.refundAmount) > 0 ? (ord.refundStatus || "COMPLETED") : "None",
              topFont: fontRegular,
              topColor: "#dc2626",
              subColor: "#dc2626"
            },
            // 13. Net Sales
            {
              top: formatINR(ord.netSales),
              sub: "",
              topFont: fontBold,
              topColor: "#059669"
            }
          ];

          let curX = leftMargin;
          cellRows.forEach((c, idx) => {
            const col = dCols[idx];
            // Line 1: Primary Value
            doc.font(c.topFont || fontRegular).fontSize(6.5).fillColor(c.topColor || "#334155").text(c.top, curX + 4, currentY + 3.5, {
              width: col.width - 8,
              align: col.align,
              lineBreak: false,
              ellipsis: true
            });

            // Line 2: Secondary / Sub-field
            if (c.sub) {
              doc.font(c.subFont || fontRegular).fontSize(5.5).fillColor(c.subColor || "#64748b").text(c.sub, curX + 4, currentY + 12.5, {
                width: col.width - 8,
                align: col.align,
                lineBreak: false,
                ellipsis: true
              });
            }

            curX += col.width;
          });

          currentY += rowHeight;
        });

        // ==========================================
        // 6. AUTHORITATIVE GRAND TOTALS ROW
        // Matches Sheet 3 totals across all qualifying orders
        // ==========================================
        const totalsRowHeight = 20;
        if (currentY + totalsRowHeight > maxY) {
          doc.addPage();
          currentY = 30;
          currentY = drawDetailsHeader(currentY);
        }

        const totalUnits = orders.reduce((sum, o) => sum + (o.unitsCount || 0), 0);
        const totalSubtotal = orders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
        const totalShipping = orders.reduce((sum, o) => sum + (Number(o.shippingFee) || 0), 0);
        const totalGross = orders.reduce((sum, o) => sum + (Number(o.grossSales) || 0), 0);
        const totalCouponSavings = orders.reduce((sum, o) => sum + (Number(o.couponSavings) || 0), 0);
        const totalOfferSavings = orders.reduce((sum, o) => sum + (Number(o.offerSavings) || 0), 0);
        const totalDiscounts = orders.reduce((sum, o) => sum + (Number(o.totalDiscounts) || 0), 0);
        const totalRefunds = orders.reduce((sum, o) => sum + (Number(o.refundAmount) || 0), 0);
        const totalNet = orders.reduce((sum, o) => sum + (Number(o.netSales) || 0), 0);

        doc.rect(leftMargin, currentY, pageWidth, totalsRowHeight).fillAndStroke("#e2e8f0", "#94a3b8");

        const totalsCells = [
          { top: "GRAND TOTALS", sub: "", font: fontBold, color: "#0f172a" },
          { top: `${orders.length} orders total`, sub: "", font: fontBold, color: "#334155" },
          { top: "", sub: "" },
          { top: "", sub: "" },
          { top: String(totalUnits), sub: "", font: fontBold, color: "#0f172a" },
          { top: formatINR(totalSubtotal), sub: "", font: fontBold, color: "#334155" },
          { top: formatINR(totalShipping), sub: "", font: fontBold, color: "#334155" },
          { top: formatINR(totalGross), sub: "", font: fontBold, color: "#2563eb" },
          { top: formatINR(totalCouponSavings), sub: "", font: fontBold, color: "#7c3aed" },
          { top: formatINR(totalOfferSavings), sub: "", font: fontBold, color: "#0d9488" },
          { top: formatINR(totalDiscounts), sub: "", font: fontBold, color: "#d97706" },
          { top: formatINR(totalRefunds), sub: "", font: fontBold, color: "#dc2626" },
          { top: formatINR(totalNet), sub: "", font: fontBold, color: "#059669" }
        ];

        let totX = leftMargin;
        totalsCells.forEach((c, idx) => {
          const col = dCols[idx];
          if (c.top) {
            doc.font(c.font || fontBold).fontSize(6.5).fillColor(c.color || "#0f172a").text(c.top, totX + 4, currentY + 6, {
              width: col.width - 8,
              align: col.align,
              lineBreak: false,
              ellipsis: true
            });
          }
          totX += col.width;
        });

        currentY += totalsRowHeight + 14;
      }

      // ==========================================
      // 7. FOOTER & PAGE NUMBERING ON ALL PAGES
      // ==========================================
      const range = doc.bufferedPageRange();
      const totalPages = range.count;

      // Defensive guard: prevent any addPage calls during footer rendering
      const originalAddPage = doc.addPage;
      doc.addPage = function () {
        console.warn("WARNING: addPage blocked during footer rendering");
        return this;
      };

      for (let i = range.start; i < range.start + totalPages; i++) {
        doc.switchToPage(i);

        // Temporarily clear bottom margin so doc.text never triggers auto-pagination
        const savedBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;

        // Subtle divider rule above footer
        doc.moveTo(leftMargin, 555).lineTo(leftMargin + pageWidth, 555).strokeColor("#e2e8f0").lineWidth(0.5).stroke();

        doc.font(fontRegular).fontSize(7).fillColor("#94a3b8");
        doc.text(
          `Page ${i + 1} of ${totalPages}   •   Electryve Executive Financial Report   •   Single Source of Truth   •   Strictly Confidential`,
          leftMargin,
          562,
          {
            align: "center",
            width: pageWidth,
            height: 12,
            lineBreak: false
          }
        );

        doc.page.margins.bottom = savedBottom;
      }
      doc.addPage = originalAddPage;

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
