const globalMiddleware = (req, res, next) => {
  if (req.path.startsWith("/admin")) {
    res.locals.user = req.session?.admin || null;
    res.locals.currentAdmin = req.session?.admin || null;
    res.locals.currentUser = null;
  } else {
    res.locals.user = req.session?.user || req.user || null;
    res.locals.currentUser = req.session?.user || req.user || null;
    res.locals.currentAdmin = null;
  }

  res.locals.errorMessage = req.session?.errorMessage || null;
  res.locals.successMessage = req.session?.successMessage || null;

  if (req.session) {
    delete req.session.errorMessage;
    delete req.session.successMessage;
  }

  next();
};

export default globalMiddleware;