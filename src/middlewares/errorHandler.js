const isJsonRequest = (req) => {
  if (req.xhr) return true;
  if (req.path.startsWith("/api") || req.path.startsWith("/payment/webhook")) return true;
  const accept = req.get("Accept") || "";
  if (accept.includes("application/json") && !accept.includes("text/html")) return true;
  if (!req.accepts("html") && req.accepts("json")) return true;
  return false;
};

const routeNotFound = (req, res, next) => {
  console.log("404 Route:", req.method, req.originalUrl);

  // Asset/static requests: return clean 404 text
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|map|woff|woff2|ttf|eot)$/i)) {
    return res.status(404).type("text/plain").send("Resource not found");
  }

  // API / AJAX JSON requests: return JSON 404
  if (isJsonRequest(req)) {
    return res.status(404).json({
      success: false,
      message: "Route not found"
    });
  }

  // User-facing HTML requests: render branded 404 view
  const isAdmin = req.path.startsWith("/admin") && req.session?.admin;
  return res.status(404).render("errors/404", {
    title: "404 - Page Not Found",
    layout: isAdmin ? "layouts/admin-layout" : "layouts/user-layout",
    url: req.originalUrl,
    isAdmin
  });
};

const globalErrorHandler = (error, req, res, next) => {
  console.error("Global Error Handler:", error);

  const statusCode = error.statusCode || 500;

  if (statusCode === 404) {
    if (isJsonRequest(req)) {
      return res.status(404).json({
        success: false,
        message: error.message || "Route not found"
      });
    }
    const isAdmin = req.path.startsWith("/admin") && req.session?.admin;
    return res.status(404).render("errors/404", {
      title: "404 - Page Not Found",
      layout: isAdmin ? "layouts/admin-layout" : "layouts/user-layout",
      url: req.originalUrl,
      isAdmin
    });
  }

  if (isJsonRequest(req)) {
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Internal Server Error"
    });
  }

  res.status(statusCode).render("errors/error", {
    layout: false,
    title: "Error",
    message: error.message || "Internal Server Error"
  });
};

export {
  routeNotFound,
  globalErrorHandler
};