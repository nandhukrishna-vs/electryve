const routeNotFound = (req, res, next) => {

  console.log("404 Route:", req.method, req.originalUrl);

  const error = new Error("Route not found");
  error.statusCode = 404;

  next(error);

};

const globalErrorHandler = (error, req, res, next) => {
  console.error(error);

  const statusCode = error.statusCode || 500;

  res.status(statusCode).render("errors/error", {
    layout: false,
    message: error.message || "Internal Server Error"
  });
};

export {
  routeNotFound,
  globalErrorHandler
};