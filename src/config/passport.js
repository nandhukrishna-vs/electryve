import dotenv from "dotenv";
dotenv.config();

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js";

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
      passReqToCallback: true
    },

    async (req, accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({
          googleId: profile.id
        });

        if (user) {
          if (user.status !== "ACTIVE") {
            return done(null, false, {
              message: "Your account is blocked."
            });
          }

          return done(null, user);
        }

        const email = profile.emails[0]?.value;

        if (email) {
          user = await User.findOne({
            email: email.toLowerCase()
          });

          if (user) {
            user.googleId = profile.id;
            user.authProvider = "GOOGLE";
            user.isEmailVerified = true;

            if (!user.avatar) {
              user.avatar = profile.photos[0]?.value || "";
            }

            await user.save();

            if (user.status !== "ACTIVE") {
              return done(null, false, {
                message: "Your account is blocked."
              });
            }

            return done(null, user);
          }

          const referralCode =
            profile.displayName
              .replace(/\s+/g, "")
              .substring(0, 5)
              .toUpperCase() +
            Math.floor(1000 + Math.random() * 9000);

          const newUser = await User.create({
            fullName: profile.displayName,
            email: email.toLowerCase(),
            authProvider: "GOOGLE",
            googleId: profile.id,
            isEmailVerified: true,
            avatar: profile.photos[0]?.value || "",
            role: "USER",
            status: "ACTIVE",
            referralCode
          });

          return done(null, newUser);
        }

        return done(null, false, {
          message: "Google account email not available."
        });
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

export default passport;