const globalMiddleware = (req, res, next) => {
  res.locals.user =
    req.user ||
    req.session.user ||
    null;

  res.locals.errorMessage =
    req.session.errorMessage || null;

  res.locals.successMessage =
    req.session.successMessage || null;

  delete req.session.errorMessage;
  delete req.session.successMessage;

  next();
};

export default globalMiddleware;