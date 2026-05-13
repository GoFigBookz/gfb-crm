import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";

const app = new Hono<{ Bindings: HttpBindings }>();

// CORS: Allow gofig.ca website to call CRM API
app.use(cors({
  origin: [
    "https://gofig.ca",
    "https://www.gofig.ca",
    "http://gofig.ca",
    "http://www.gofig.ca",
    "https://gofigbookz.ca",
    "https://www.gofigbookz.ca",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
  ],
  allowMethods: ["POST", "GET", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: false, // No cookies for public API
}));

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
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

  // Start background auto-sync scheduler
  const { startSyncScheduler } = await import("./sync-scheduler");
  startSyncScheduler();

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer();
