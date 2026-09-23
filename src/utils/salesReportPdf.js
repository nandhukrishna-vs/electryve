import PDFDocument from "pdfkit";
import fs from "fs";

// Determine system font availability for INR symbol (₹)
const SEGOE_REGULAR = "C:/Windows/Fonts/segoeui.ttf";
const SEGOE_BOLD = "C:/Windows/Fonts/segoeuib.ttf";
const hasSegoe = fs.existsSync(SEGOE_REGULAR) && fs.existsSync(SEGOE_BOLD);

/**
 * Generates an authoritative PDF sales report and returns a Buffer.
 *
 * @param {Object} data
 * @param {Object} data.summary - KPI summary object
 * @param {Object} data.grouped - Grouped periodic data
 * @param {Array} data.orders - Array of detailed order records
 * @returns {Promise<Buffer>}
 */
export const generateSalesReportPdf = async ({ summary, grouped, orders = [] }) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 36,
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

      const pageWidth = 523; // 595 - 36*2
      const leftMargin = 36;

      // Header Banner
      doc.rect(leftMargin, 36, pageWidth, 48).fill("#0f172a");
      doc.font(fontBold).fontSize(16).fillColor("#ffffff").text("ELECTRYVE", leftMargin + 16, 46, { continued: true });
      doc.font(fontRegular).fontSize(10).fillColor("#94a3b8").text("  |  EXECUTIVE SALES & REVENUE REPORT");

      doc.font(fontRegular).fontSize(8).fillColor("#cbd5e1").text(
        `Generated: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
        leftMargin + 16,
        64
      );

      doc.y = 96;

      // Metadata / Filter Badges Box
      doc.rect(leftMargin, doc.y, pageWidth, 38).fill("#f8fafc");
      doc.rect(leftMargin, doc.y, pageWidth, 38).stroke("#e2e8f0");

      const kpis = summary?.kpis || {};
      const period = summary?.period || {};
      const filters = summary?.filters || {};

      doc.font(fontBold).fontSize(8).fillColor("#334155").text("Date Range:", leftMargin + 10, doc.y + 8, { continued: true });
      doc.font(fontRegular).fillColor("#475569").text(` ${period.label || "Custom"} (${period.startDate || "—"} to ${period.endDate || "—"})`);

      doc.font(fontBold).fontSize(8).fillColor("#334155").text("Applied Filters:", leftMargin + 10, doc.y + 4, { continued: true });
      doc.font(fontRegular).fillColor("#475569").text(
        ` Payment: ${filters.paymentMethod || "ALL"}  •  Status: ${filters.orderStatus || "ALL"}${filters.search ? `  •  Search: "${filters.search}"` : ""}`
      );

      doc.y = 144;

      // KPI Summary Grid (6 authoritative cards)
      doc.font(fontBold).fontSize(11).fillColor("#0f172a").text("EXECUTIVE FINANCIAL SUMMARY", leftMargin, doc.y);
      doc.y += 6;

      const cardW = (pageWidth - 16) / 3;
      const cardH = 46;
      const cardStartY = doc.y;

      const summaryCards = [
        { title: "NET SALES", value: formatINR(kpis.netSales), color: "#059669", sub: "Gross minus completed refunds" },
        { title: "GROSS SALES", value: formatINR(kpis.grossSales), color: "#2563eb", sub: "Total realized sales volume" },
        { title: "TOTAL ORDERS", value: String(kpis.totalOrders || 0), color: "#0f172a", sub: "Finalized qualifying orders" },
        { title: "UNITS SOLD", value: String(kpis.unitsSold || 0), color: "#0891b2", sub: "Excludes cancelled/returns" },
        { title: "TOTAL REFUNDS", value: formatINR(kpis.completedRefunds), color: "#dc2626", sub: "Completed refund deductions" },
        {
          title: "TOTAL DISCOUNTS",
          value: formatINR(kpis.totalDiscounts),
          color: "#d97706",
          sub: `Coupons: ${formatINR(kpis.couponSavings)} | Offers: ${formatINR(kpis.offerSavings)}`
        }
      ];

      summaryCards.forEach((card, idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const x = leftMargin + col * (cardW + 8);
        const y = cardStartY + row * (cardH + 8);

        doc.rect(x, y, cardW, cardH).fill("#f1f5f9");
        doc.rect(x, y, cardW, cardH).stroke("#cbd5e1");

        doc.font(fontBold).fontSize(7).fillColor("#64748b").text(card.title, x + 8, y + 6);
        doc.font(fontBold).fontSize(11).fillColor(card.color).text(card.value, x + 8, y + 16);
        doc.font(fontRegular).fontSize(6.5).fillColor("#64748b").text(card.sub, x + 8, y + 32, { width: cardW - 16 });
      });

      doc.y = cardStartY + 2 * (cardH + 8) + 12;

      // Grouped Periodic Performance Table
      const groupedRows = grouped?.rows || [];
      if (groupedRows.length > 0) {
        doc.font(fontBold).fontSize(10).fillColor("#0f172a").text(`PERIODIC PERFORMANCE (${(grouped.groupBy || "day").toUpperCase()})`, leftMargin, doc.y);
        doc.y += 6;

        const gCols = [
          { header: "Period", width: 100, align: "left" },
          { header: "Orders", width: 45, align: "right" },
          { header: "Units", width: 45, align: "right" },
          { header: "Gross Sales", width: 80, align: "right" },
          { header: "Discounts", width: 80, align: "right" },
          { header: "Refunds", width: 80, align: "right" },
          { header: "Net Sales", width: 93, align: "right" }
        ];

        // Draw Table Header
        const drawGroupedHeader = () => {
          doc.rect(leftMargin, doc.y, pageWidth, 18).fill("#1e293b");
          let curX = leftMargin;
          gCols.forEach((col) => {
            doc.font(fontBold).fontSize(7.5).fillColor("#ffffff").text(col.header, curX + 4, doc.y + 4, {
              width: col.width - 8,
              align: col.align
            });
            curX += col.width;
          });
          doc.y += 18;
        };

        drawGroupedHeader();

        groupedRows.slice(0, 15).forEach((row, rIdx) => {
          if (doc.y > 740) {
            doc.addPage();
            drawGroupedHeader();
          }

          const bgColor = rIdx % 2 === 0 ? "#ffffff" : "#f8fafc";
          doc.rect(leftMargin, doc.y, pageWidth, 16).fill(bgColor);

          let curX = leftMargin;
          const vals = [
            row.label || row.periodKey,
            String(row.orderCount || 0),
            String(row.unitsSold || 0),
            formatINR(row.grossSales),
            formatINR(row.totalDiscounts),
            formatINR(row.completedRefunds),
            formatINR(row.netSales)
          ];

          vals.forEach((txt, cIdx) => {
            const isNet = cIdx === 6;
            doc.font(isNet ? fontBold : fontRegular).fontSize(7).fillColor(isNet ? "#059669" : "#334155").text(txt, curX + 4, doc.y + 4, {
              width: gCols[cIdx].width - 8,
              align: gCols[cIdx].align
            });
            curX += gCols[cIdx].width;
          });

          doc.y += 16;
        });

        doc.y += 16;
      }

      // Detailed Orders Table
      if (orders.length > 0) {
        if (doc.y > 660) {
          doc.addPage();
        }

        doc.font(fontBold).fontSize(10).fillColor("#0f172a").text(`DETAILED ORDERS LIST (${orders.length} Records)`, leftMargin, doc.y);
        doc.y += 6;

        const dCols = [
          { header: "Order #", width: 75, align: "left" },
          { header: "Date", width: 65, align: "left" },
          { header: "Customer", width: 85, align: "left" },
          { header: "Payment", width: 55, align: "left" },
          { header: "Units", width: 35, align: "right" },
          { header: "Gross", width: 50, align: "right" },
          { header: "Discounts", width: 45, align: "right" },
          { header: "Refunds", width: 45, align: "right" },
          { header: "Net Sales", width: 68, align: "right" }
        ];

        const drawDetailsHeader = () => {
          doc.rect(leftMargin, doc.y, pageWidth, 18).fill("#334155");
          let curX = leftMargin;
          dCols.forEach((col) => {
            doc.font(fontBold).fontSize(7.5).fillColor("#ffffff").text(col.header, curX + 4, doc.y + 4, {
              width: col.width - 8,
              align: col.align
            });
            curX += col.width;
          });
          doc.y += 18;
        };

        drawDetailsHeader();

        orders.forEach((ord, rIdx) => {
          if (doc.y > 750) {
            doc.addPage();
            drawDetailsHeader();
          }

          const bgColor = rIdx % 2 === 0 ? "#ffffff" : "#f8fafc";
          doc.rect(leftMargin, doc.y, pageWidth, 16).fill(bgColor);

          let curX = leftMargin;
          const vals = [
            ord.orderNumber,
            (ord.formattedDate || "").split(",")[0],
            (ord.customerName || "Customer").substring(0, 16),
            ord.paymentMethod,
            String(ord.unitsCount || 0),
            formatINR(ord.grossSales),
            formatINR(ord.totalDiscounts),
            formatINR(ord.refundAmount),
            formatINR(ord.netSales)
          ];

          vals.forEach((txt, cIdx) => {
            const isNet = cIdx === 8;
            doc.font(isNet ? fontBold : fontRegular).fontSize(6.5).fillColor(isNet ? "#059669" : "#334155").text(txt, curX + 4, doc.y + 4, {
              width: dCols[cIdx].width - 8,
              align: dCols[cIdx].align
            });
            curX += dCols[cIdx].width;
          });

          doc.y += 16;
        });
      }

      // Add Footer with Page Numbers to all pages
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.font(fontRegular).fontSize(7.5).fillColor("#94a3b8");
        doc.text(
          `Page ${i + 1} of ${range.count}   •   Electryve Confidential Financial Report   •   Single Source of Truth`,
          leftMargin,
          800,
          {
            align: "center",
            width: pageWidth
          }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
