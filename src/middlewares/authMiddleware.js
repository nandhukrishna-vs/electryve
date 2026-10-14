import User from "../models/User.js";

const isJsonRequest = (req) => {
  if (req.xhr) return true;
  if (req.path.startsWith("/api") || (req.originalUrl && req.originalUrl.startsWith("/api"))) return true;
  const accept = req.get("Accept") || "";
  const contentType = req.get("Content-Type") || "";
  if (accept.includes("application/json") && !accept.includes("text/html")) return true;
  if (contentType.includes("application/json")) return true;
  if (!req.accepts("html") && req.accepts("json")) return true;
  return false;
};

const isLoggedIn = async (req, res, next) => {
  try {
    if (!req.session?.user) {
      if (isJsonRequest(req)) {
        return res.status(401).json({
          success: false,
          message: "Authentication required. Please log in to continue."
        });
      }
      req.session.errorMessage = "Please login first";
      return res.redirect("/auth/login");
    }

    const user = await User.findById(req.session.user.id);

    if (!user || user.status === "BLOCKED" || user.status === "DELETED") {
      req.session.destroy(() => {});
      res.clearCookie("user.sid");
      if (isJsonRequest(req)) {
        const message = user?.status === "BLOCKED"
          ? "Your account has been blocked. Please contact support."
          : "Authentication required. Please log in to continue.";
        return res.status(401).json({ success: false, message });
      }
      return res.redirect("/auth/login");
    }

    req.currentUser = user;

    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    if (isJsonRequest(req)) {
      return res.status(500).json({ success: false, message: "Authentication error occurred." });
    }
    return res.redirect("/auth/login");
  }
};

const isLoggedOut = (req, res, next) => {
  if (req.session.user) {
    return res.redirect("/");
  }

  next();
};

export {
  isLoggedIn,
  isLoggedOut
};