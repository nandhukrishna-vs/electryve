import session from "express-session";
import dotenv from "dotenv";

dotenv.config();

const sessionConfig = session({
  secret: process.env.SESSION_SECRET,

  resave: false,

  saveUninitialized: false,

  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    httpOnly: true,
    secure: false
  }
});

export default sessionConfig;