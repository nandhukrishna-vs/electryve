import PDFDocument from "pdfkit";

/**
 * Generates and streams a professional PDF invoice for an order.
 * Uses trusted historical snapshot data stored in the Order document.
 * 
 * @param {Object} order - Populated Mongoose order document
 * @param {Object} res - Express response object
 */
export const generateInvoicePDF = (order, res) => {
  const doc = new PDFDocument({ margin: 40, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="invoice-${order.orderNumber}.pdf"`);

  doc.pipe(res);

  // 1. Header & Brand
  doc
    .fillColor("#111827")
    .fontSize(22)
    .font("Helvetica-Bold")
    .text("ELECTRYVE", 40, 40);

  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#6B7280")
    .text("Next-Gen Electronics & Appliances", 40, 68)
    .text("support@electryve.com | www.electryve.com", 40, 80);

  doc
    .fontSize(16)
    .font("Helvetica-Bold")
    .fillColor("#111827")
    .text("TAX INVOICE", 400, 40, { align: "right" });

  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#4B5563")
    .text(`Invoice No: INV-${order.orderNumber.replace(/^ELV-/, "")}`, 400, 62, { align: "right" })
    .text(`Order ID: ${order.orderNumber}`, 400, 75, { align: "right" })
    .text(`Order Date: ${new Date(order.createdAt).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}`, 400, 88, { align: "right" });

  // Divider
  doc
    .moveTo(40, 108)
    .lineTo(555, 108)
    .strokeColor("#E5E7EB")
    .stroke();

  // 2. Billing & Order Info Blocks
  const startInfoY = 120;

  // Bill / Ship To
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor("#111827")
    .text("SHIPPING & BILLING ADDRESS", 40, startInfoY);

  const addr = order.shippingAddress || {};
  const customerName = order.user?.fullName || addr.fullName || "Valued Customer";
  const customerEmail = order.user?.email || "N/A";
  const customerPhone = addr.phone || order.user?.phone || "N/A";

  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor("#1F2937")
    .text(customerName, 40, startInfoY + 16);

  let currentAddrY = startInfoY + 28;
  if (addr.addressLine1) {
    doc.font("Helvetica").fillColor("#4B5563").text(addr.addressLine1, 40, currentAddrY);
    currentAddrY += 12;
  }
  if (addr.addressLine2) {
    doc.font("Helvetica").fillColor("#4B5563").text(addr.addressLine2, 40, currentAddrY);
    currentAddrY += 12;
  }
  if (addr.landmark) {
    doc.font("Helvetica").fillColor("#6B7280").text(`Landmark: ${addr.landmark}`, 40, currentAddrY);
    currentAddrY += 12;
  }
  doc.font("Helvetica").fillColor("#4B5563").text(`${addr.city || ""}, ${addr.state || ""} - ${addr.pinCode || ""}`, 40, currentAddrY);
  currentAddrY += 12;
  doc.font("Helvetica").fillColor("#4B5563").text(`Phone: ${customerPhone} | Email: ${customerEmail}`, 40, currentAddrY);

  // Order Details Block (Right Column)
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor("#111827")
    .text("ORDER SUMMARY", 350, startInfoY);

  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#4B5563")
    .text(`Payment Method: ${order.paymentMethod}`, 350, startInfoY + 16)
    .text(`Payment Status: ${order.paymentStatus}`, 350, startInfoY + 28)
    .text(`Order Status: ${order.orderStatus}`, 350, startInfoY + 40);

  if (order.cancellationReason) {
    doc.fillColor("#DC2626").text(`Cancel Reason: ${order.cancellationReason}`, 350, startInfoY + 54);
  } else if (order.returnReason) {
    doc.fillColor("#4B5563").text(`Return Reason: ${order.returnReason}`, 350, startInfoY + 54);
  }

  // Divider
  const tableStartY = Math.max(currentAddrY + 20, startInfoY + 75);
  doc
    .moveTo(40, tableStartY)
    .lineTo(555, tableStartY)
    .strokeColor("#E5E7EB")
    .stroke();

  // 3. Items Table Header
  const tableHeaderY = tableStartY + 10;
  doc
    .rect(40, tableHeaderY, 515, 20)
    .fillColor("#F3F4F6")
    .fill();

  doc
    .fontSize(8)
    .font("Helvetica-Bold")
    .fillColor("#374151")
    .text("#", 45, tableHeaderY + 6)
    .text("ITEM / PRODUCT", 65, tableHeaderY + 6)
    .text("VARIANT", 240, tableHeaderY + 6)
    .text("UNIT PRICE", 330, tableHeaderY + 6, { width: 50, align: "right" })
    .text("QTY", 390, tableHeaderY + 6, { width: 30, align: "center" })
    .text("STATUS", 430, tableHeaderY + 6, { width: 55, align: "center" })
    .text("TOTAL", 495, tableHeaderY + 6, { width: 55, align: "right" });

  let rowY = tableHeaderY + 25;

  // 4. Item Rows
  order.items.forEach((item, index) => {
    const itemStatus = item.itemStatus || "ACTIVE";
    const isCancelled = itemStatus === "CANCELLED";
    const isReturned = itemStatus === "RETURNED";

    // Alternate subtle background
    if (index % 2 === 1) {
      doc
        .rect(40, rowY - 3, 515, 22)
        .fillColor("#FAFAFA")
        .fill();
    }

    const textColor = isCancelled ? "#9CA3AF" : "#1F2937";

    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(textColor)
      .text(String(index + 1), 45, rowY)
      .text(item.productName || "Product", 65, rowY, { width: 170, ellipsis: true })
      .text(item.variantDetails || "-", 240, rowY, { width: 85, ellipsis: true })
      .text(`INR ${item.salePrice.toLocaleString("en-IN")}`, 330, rowY, { width: 50, align: "right" })
      .text(String(item.quantity), 390, rowY, { width: 30, align: "center" });

    // Status text with color
    if (isCancelled) {
      doc.fillColor("#DC2626").text("CANCELLED", 430, rowY, { width: 55, align: "center" });
    } else if (isReturned) {
      doc.fillColor("#4B5563").text("RETURNED", 430, rowY, { width: 55, align: "center" });
    } else {
      doc.fillColor("#059669").text("ACTIVE", 430, rowY, { width: 55, align: "center" });
    }

    doc
      .fillColor(textColor)
      .text(`INR ${item.itemTotal.toLocaleString("en-IN")}`, 495, rowY, { width: 55, align: "right" });

    rowY += 22;

    // Show item cancellation/return note if exists
    if (item.cancellationReason) {
      doc
        .fontSize(7)
        .font("Helvetica-Oblique")
        .fillColor("#DC2626")
        .text(`Note: ${item.cancellationReason}`, 65, rowY);
      rowY += 12;
    } else if (item.returnReason) {
      doc
        .fontSize(7)
        .font("Helvetica-Oblique")
        .fillColor("#4B5563")
        .text(`Return Note: ${item.returnReason}`, 65, rowY);
      rowY += 12;
    }
  });

  // Divider
  doc
    .moveTo(40, rowY + 5)
    .lineTo(555, rowY + 5)
    .strokeColor("#E5E7EB")
    .stroke();

  // 5. Totals Block (Right Aligned)
  let totalsY = rowY + 15;

  const drawTotalLine = (label, value, isBold = false) => {
    doc
      .fontSize(9)
      .font(isBold ? "Helvetica-Bold" : "Helvetica")
      .fillColor(isBold ? "#111827" : "#4B5563")
      .text(label, 360, totalsY, { width: 100, align: "right" })
      .text(value, 470, totalsY, { width: 80, align: "right" });
    totalsY += 16;
  };

  drawTotalLine("Subtotal:", `INR ${order.subtotal.toLocaleString("en-IN")}`);

  if (order.discount > 0) {
    drawTotalLine("Discount:", `-INR ${order.discount.toLocaleString("en-IN")}`);
  }

  if (order.coupon && order.coupon.discountAmount > 0) {
    drawTotalLine(`Coupon (${order.coupon.code}):`, `-INR ${order.coupon.discountAmount.toLocaleString("en-IN")}`);
  }

  const shippingText = order.shippingCharge === 0 ? "FREE" : `INR ${order.shippingCharge.toLocaleString("en-IN")}`;
  drawTotalLine("Shipping:", shippingText);

  if (order.tax > 0) {
    drawTotalLine("Tax:", `INR ${order.tax.toLocaleString("en-IN")}`);
  }

  doc
    .moveTo(360, totalsY)
    .lineTo(555, totalsY)
    .strokeColor("#D1D5DB")
    .stroke();

  totalsY += 6;
  drawTotalLine("Final Payable:", `INR ${order.finalAmount.toLocaleString("en-IN")}`, true);

  // 6. Footer & Terms
  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor("#9CA3AF")
    .text("This is a computer-generated tax invoice and does not require a physical signature.", 40, 760, { align: "center", width: 515 })
    .text("Thank you for shopping with Electryve! For inquiries, email support@electryve.com", 40, 772, { align: "center", width: 515 });

  doc.end();
};
