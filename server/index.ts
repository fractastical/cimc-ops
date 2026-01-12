import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
  }
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// CORS for embed routes - allow cross-origin requests for chart embeds
app.use((req, res, next) => {
  // Allow CORS for embed routes and their API dependencies
  if (req.path.startsWith('/embed/') || 
      req.path === '/api/hypotheses/activity/timeline' ||
      req.path === '/api/activity/monthly' ||
      req.path === '/api/activity/summary' ||
      req.path === '/api/research/timeline') {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
  }
  next();
});

// Password protection middleware (legacy - session is now set up via Replit Auth in routes.ts)
app.use((req, res, next) => {
  // Skip auth for Slack endpoints (they use their own signature verification)
  if (req.path.startsWith("/api/slack/")) {
    return next();
  }
  
  // Skip auth for auth endpoints (both legacy /api/auth/* and Replit Auth /api/login, /api/callback, /api/logout)
  if (req.path.startsWith("/api/auth/") || 
      req.path === "/api/login" || 
      req.path === "/api/callback" || 
      req.path === "/api/logout") {
    return next();
  }
  
  // Skip auth for embed routes and their API dependencies (public endpoints)
  if (req.path.startsWith("/embed/") ||
      req.path === "/api/hypotheses/activity/timeline" ||
      req.path === "/api/activity/monthly" ||
      req.path === "/api/activity" ||
      req.path === "/api/activity/summary" ||
      req.path === "/api/research/timeline") {
    return next();
  }
  
  // Check if password protection is enabled
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) {
    return next();
  }
  
  // Check if authenticated for API routes
  if (req.path.startsWith("/api/") && !req.session.authenticated) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
