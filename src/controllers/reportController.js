import * as reportService from "../services/reportService.js";
import { generateSalesReportPdf } from "../utils/salesReportPdf.js";
import { generateSalesReportExcel } from "../utils/salesReportExcel.js";

/**
 * Controller for Admin Sales Report page, AJAX API, and exports.
 */

export const loadSalesReport = async (req, res) => {
  try {
    const preset = req.query.preset || "this_month";
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const paymentMethod = req.query.paymentMethod || "ALL";
    const orderStatus = req.query.orderStatus || "ALL";
    const search = req.query.search || "";
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const groupBy = req.query.groupBy || null;

    const [summary, grouped, details] = await Promise.all([
      reportService.getSalesReportSummary({ preset, startDate, endDate, paymentMethod, orderStatus, search }),
      reportService.getSalesReportGrouped({ preset, startDate, endDate, paymentMethod, orderStatus, search, groupBy }),
      reportService.getSalesReportDetails({ preset, startDate, endDate, paymentMethod, orderStatus, search, page, limit })
    ]);

    res.render("admin/sales-report", {
      layout: "layouts/admin-layout",
      title: "Sales Report",
      summary,
      grouped,
      details,
      query: {
        preset: summary.period.preset,
        startDate: summary.period.startDate,
        endDate: summary.period.endDate,
        paymentMethod,
        orderStatus,
        search,
        page,
        limit,
        groupBy: grouped.groupBy
      }
    });
  } catch (error) {
    console.error("Load Sales Report Error:", error);
    res.render("admin/sales-report", {
      layout: "layouts/admin-layout",
      title: "Sales Report",
      error: error.message || "Failed to load sales report",
      summary: {
        period: { preset: "this_month", label: "This Month", startDate: "", endDate: "" },
        filters: { paymentMethod: "ALL", orderStatus: "ALL", search: "" },
        kpis: { netSales: 0, grossSales: 0, totalOrders: 0, unitsSold: 0, completedRefunds: 0, totalDiscounts: 0, couponSavings: 0, offerSavings: 0 }
      },
      grouped: { groupBy: "day", rows: [] },
      details: { orders: [], pagination: { page: 1, limit: 10, totalOrders: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false } },
      query: { preset: "this_month", paymentMethod: "ALL", orderStatus: "ALL", search: "", page: 1, limit: 10 }
    });
  }
};

export const getSalesReportData = async (req, res) => {
  try {
    const preset = req.query.preset || "this_month";
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const paymentMethod = req.query.paymentMethod || "ALL";
    const orderStatus = req.query.orderStatus || "ALL";
    const search = req.query.search || "";
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const groupBy = req.query.groupBy || null;
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder || "desc";

    const [summary, grouped, details] = await Promise.all([
      reportService.getSalesReportSummary({ preset, startDate, endDate, paymentMethod, orderStatus, search }),
      reportService.getSalesReportGrouped({ preset, startDate, endDate, paymentMethod, orderStatus, search, groupBy }),
      reportService.getSalesReportDetails({ preset, startDate, endDate, paymentMethod, orderStatus, search, page, limit, sortBy, sortOrder })
    ]);

    return res.json({
      success: true,
      summary,
      grouped,
      details
    });
  } catch (error) {
    console.error("Get Sales Report Data Error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch sales report data"
    });
  }
};

export const exportSalesReportPdf = async (req, res) => {
  try {
    const preset = req.query.preset || "this_month";
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const paymentMethod = req.query.paymentMethod || "ALL";
    const orderStatus = req.query.orderStatus || "ALL";
    const search = req.query.search || "";
    const groupBy = req.query.groupBy || null;

    const data = await reportService.getAllSalesReportOrders({
      preset,
      startDate,
      endDate,
      paymentMethod,
      orderStatus,
      search,
      groupBy
    });

    const pdfBuffer = await generateSalesReportPdf(data);
    const startStr = data.summary?.period?.startDate || "start";
    const endStr = data.summary?.period?.endDate || "end";
    const filename = `electryve-sales-report-${startStr}-to-${endStr}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Export Sales Report PDF Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate PDF report"
    });
  }
};

export const exportSalesReportExcel = async (req, res) => {
  try {
    const preset = req.query.preset || "this_month";
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const paymentMethod = req.query.paymentMethod || "ALL";
    const orderStatus = req.query.orderStatus || "ALL";
    const search = req.query.search || "";
    const groupBy = req.query.groupBy || null;

    const data = await reportService.getAllSalesReportOrders({
      preset,
      startDate,
      endDate,
      paymentMethod,
      orderStatus,
      search,
      groupBy
    });

    const excelBuffer = await generateSalesReportExcel(data);
    const startStr = data.summary?.period?.startDate || "start";
    const endStr = data.summary?.period?.endDate || "end";
    const filename = `electryve-sales-report-${startStr}-to-${endStr}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", excelBuffer.length);

    return res.send(excelBuffer);
  } catch (error) {
    console.error("Export Sales Report Excel Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate Excel report"
    });
  }
};
