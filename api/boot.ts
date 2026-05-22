import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { createOAuthCallbackHandler } from "./google/auth";
import { Paths } from "@contracts/constants";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(cors({
  origin: [
    "https://gofig.ca",
    "https://www.gofig.ca",
    "https://figgy.gofig.ca",
    "http://localhost:3000",
    "http://localhost:5173",
  ],
  allowMethods: ["POST", "GET", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: false,
}));

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// Returns Google Client ID to frontend at runtime
app.get("/api/auth/config", (c) =>
  c.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || "" })
);

// Health check endpoint
app.get("/api/health", (c) => c.json({ status: "ok", time: Date.now() }));

app.get(Paths.oauthCallback, createOAuthCallbackHandler());

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

async function startServer() {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const { startSyncScheduler } = await import("./sync-scheduler");
  startSyncScheduler();

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer();
