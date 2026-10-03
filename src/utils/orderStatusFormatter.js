/**
 * Centralized Order & Item Status Formatting Utility
 *
 * Provides authoritative human-readable label mapping and CSS badge classes
 * for order-level and item-level fulfillment statuses.
 *
 * Strictly preserves raw database enums for backend persistence, API requests,
 * and state transitions while presenting polished human-readable labels to users.
 */

export const ORDER_STATUS_LABELS = Object.freeze({
  PLACED: "Placed",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURNED: "Returned",
  RETURN_REQUESTED: "Return Requested",
  RETURN_APPROVED: "Return Approved",
  RETURN_REJECTED: "Return Rejected",
  PARTIALLY_SHIPPED: "Partially Shipped",
  PARTIALLY_DELIVERED: "Partially Delivered",
  PARTIALLY_FULFILLED: "Partially Fulfilled",
  ACTIVE: "Active",
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing"
});

/**
 * Maps any order status or item status enum to a human-readable display label.
 *
 * @param {string|null|undefined} status - Database enum (e.g. 'OUT_FOR_DELIVERY')
 * @param {string} [fallback=""] - Fallback string if status is null/undefined/empty
 * @returns {string} - Formatted label (e.g. 'Out for Delivery')
 */
export const formatOrderStatus = (status, fallback = "") => {
  if (status === null || status === undefined) {
    return fallback;
  }

  const str = String(status).trim();
  if (!str) {
    return fallback;
  }

  const upper = str.toUpperCase();
  if (ORDER_STATUS_LABELS[upper]) {
    return ORDER_STATUS_LABELS[upper];
  }

  // Safe fallback for unmapped statuses: "SOME_NEW_STATUS" -> "Some New Status"
  return str
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

/**
 * Returns consistent Bootstrap subtle badge CSS classes based on raw status enum.
 * Keeps raw enum for CSS mapping logic.
 *
 * @param {string|null|undefined} status - Database enum
 * @returns {string} - Bootstrap badge classes
 */
export const getOrderStatusBadgeClass = (status) => {
  const upper = String(status || "").trim().toUpperCase();

  switch (upper) {
    case "DELIVERED":
      return "bg-success-subtle text-success border border-success-subtle";
    case "SHIPPED":
    case "PARTIALLY_SHIPPED":
      return "bg-info-subtle text-info-emphasis border border-info-subtle";
    case "OUT_FOR_DELIVERY":
    case "PARTIALLY_DELIVERED":
    case "PARTIALLY_FULFILLED":
      return "bg-warning-subtle text-warning-emphasis border border-warning-subtle";
    case "PLACED":
    case "ACTIVE":
    case "CONFIRMED":
    case "PROCESSING":
    case "PENDING":
      return "bg-primary-subtle text-primary border border-primary-subtle";
    case "CANCELLED":
      return "bg-danger-subtle text-danger border border-danger-subtle";
    case "RETURNED":
      return "bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle";
    default:
      return "bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle";
  }
};
