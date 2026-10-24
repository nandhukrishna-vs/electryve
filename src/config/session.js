import session from "express-session";
import MongoStore from "connect-mongo";
import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const KNOWN_DEV_SECRETS = new Set([
  "electryve-session-secret-fallback",
  "electryve-dev-session-secret-local-only",
  "electryve-dev-session-secret",
  "secret",
  "supersecret",
  "password",
  "changeme",
  "12345678",
  "1234567890",
  "12345678901234567890123456789012",
  "keyboardcat",
  "session-secret",
  "your-session-secret-here",
  "change_this_to_a_secure_secret_key"
]);

/**
 * Production Session Secret Validation:
 *
 * Cryptographic Requirement:
 * In production, SESSION_SECRET must be generated using a cryptographically secure
 * pseudo-random number generator (CSPRNG), such as:
 *   node -e "console.log(crypto.randomBytes(32).toString('hex'))"
 * which provides at least 256 bits of cryptographic entropy.
 *
 * Defense-in-Depth Sanity Checks:
 * The checks below (minimum length, blacklist rejection, character diversity, and repeating-pattern
 * heuristics) are baseline sanity heuristics designed to catch empty strings, accidental omissions,
 * and obvious development placeholders or repeated-chunk patterns. They do NOT mathematically prove
 * or guarantee cryptographic entropy (e.g. non-repeating predictable sequences can pass character diversity
 * and pattern tests). Genuine security strictly relies on generating the secret using an approved CSPRNG.
 */
if (isProduction) {
  const secret = process.env.SESSION_SECRET ? process.env.SESSION_SECRET.trim() : "";
  if (!secret) {
    throw new Error(
      "[SECURITY CONFIG ERROR] SESSION_SECRET environment variable is missing or blank in production."
    );
  }
  if (KNOWN_DEV_SECRETS.has(secret.toLowerCase())) {
    throw new Error(
      "[SECURITY CONFIG ERROR] Known or insecure development SESSION_SECRET cannot be used in production."
    );
  }
  if (secret.length < 32) {
    throw new Error(
      "[SECURITY CONFIG ERROR] SESSION_SECRET must be at least 32 characters long in production."
    );
  }
  const uniqueChars = new Set(secret).size;
  if (uniqueChars < 8) {
    throw new Error(
      "[SECURITY CONFIG ERROR] SESSION_SECRET lacks sufficient character diversity (too repetitive) for production. Cryptographically generated secret required."
    );
  }
  if (/^(.+)\1+$/i.test(secret)) {
    throw new Error(
      "[SECURITY CONFIG ERROR] SESSION_SECRET contains repeating patterns and lacks sufficient complexity for production. Cryptographically generated secret required."
    );
  }
}

const sessionSecret = process.env.SESSION_SECRET || "electryve-dev-session-secret-local-only";

/**
 * MongoDB Session Store Connection Resolution:
 *
 * Consistent with src/config/db.js:
 * - In test environment: Use TEST_MONGODB_URI / TEST_MONGO_URI with fallback to isolated 'electryve_test'.
 * - In production environment: Strictly require MONGODB_URI or MONGO_URI; reject missing configuration
 *   and never silently fall back to localhost in production.
 * - In local development: Use MONGODB_URI / MONGO_URI if set, falling back to local MongoDB.
 */
let mongoUri;
if (process.env.NODE_ENV === "test") {
  mongoUri =
    process.env.TEST_MONGODB_URI ||
    process.env.TEST_MONGO_URI ||
    "mongodb://127.0.0.1:27017/electryve_test";
} else if (isProduction) {
  const envUri = (process.env.MONGODB_URI || process.env.MONGO_URI || "").trim();
  if (!envUri) {
    throw new Error(
      "[DATABASE CONFIG ERROR] Neither MONGODB_URI nor MONGO_URI is defined in environment variables for session store in production."
    );
  }
  mongoUri = envUri;
} else {
  mongoUri =
    process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/electryve";
}

const userStore = MongoStore.create({
  mongoUrl: mongoUri,
  collectionName: "user_sessions",
  ttl: 24 * 60 * 60,
  autoRemove: "native",
  touchAfter: 24 * 3600
});

const adminStore = MongoStore.create({
  mongoUrl: mongoUri,
  collectionName: "admin_sessions",
  ttl: 24 * 60 * 60,
  autoRemove: "native",
  touchAfter: 24 * 3600
});

const userSession = session({
  name: "user.sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: userStore,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax"
  }
});

const adminSession = session({
  name: "admin.sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: adminStore,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax"
  }
});

export { userSession, adminSession };
export default userSession;
