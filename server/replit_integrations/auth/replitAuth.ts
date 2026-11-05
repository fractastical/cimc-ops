import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET || "cimc-admin-session-secret",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Password-based login
  app.post("/api/auth/password", (req, res) => {
    const { password } = req.body;
    const sitePassword = process.env.SITE_PASSWORD;

    if (!sitePassword) {
      console.error("SITE_PASSWORD not configured");
      return res.status(500).json({ error: "Server configuration error" });
    }

    if (password === sitePassword) {
      (req.session as any).authenticated = true;
      (req.session as any).loginTime = Date.now();
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ error: "Login failed" });
        }
        res.json({ success: true });
      });
    } else {
      res.status(401).json({ error: "Invalid password" });
    }
  });

  // Check auth status
  app.get("/api/auth/user", (req, res) => {
    if ((req.session as any)?.authenticated) {
      res.json({ 
        authenticated: true,
        email: process.env.OWNER_EMAIL || null,
        firstName: "You",
        lastName: null,
        isAdmin: true
      });
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  });

  // Logout
  app.get("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
      }
      res.redirect("/");
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if ((req.session as any)?.authenticated) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};
