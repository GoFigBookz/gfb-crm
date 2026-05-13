import path from "path";
import { serveStatic } from "@hono/node-server/serve-static";

export function serveStaticFiles(app: any) {
  const distPath = path.resolve(process.cwd(), "dist/public");

  // Serve static assets (JS, CSS, images, etc.)
  app.use("/assets/*", serveStatic({ root: distPath }));
  app.use("/*.jpg", serveStatic({ root: distPath }));
  app.use("/*.png", serveStatic({ root: distPath }));
  app.use("/*.svg", serveStatic({ root: distPath }));
  app.use("/*.ico", serveStatic({ root: distPath }));

  // SPA fallback: serve index.html for all non-API routes
  app.get("/*", async (c, next) => {
    const pathname = c.req.path;
    // Don't interfere with API routes
    if (pathname.startsWith("/api/")) {
      return next();
    }
    // For everything else, serve index.html (React handles routing)
    return serveStatic({ root: distPath, path: "/index.html" })(c, next);
  });
}
