import path from "path";
import { serveStatic } from "@hono/node-server/serve-static";

export function serveStaticFiles(app: any) {
  const distPath = path.resolve(process.cwd(), "dist/public");

  // Content-hashed build assets (index-<hash>.js/.css) are immutable — cache
  // them hard. CRITICAL: if a hashed asset is missing (a browser holding a
  // CACHED old index.html requests a now-deleted hash after a redeploy), return
  // a real 404 — do NOT fall through to the SPA fallback, which would serve
  // index.html (text/html) for a .js request → MIME error → white screen.
  app.use("/assets/*", serveStatic({
    root: distPath,
    onFound: (_p: string, c: any) => c.header("Cache-Control", "public, max-age=31536000, immutable"),
  }));
  app.get("/assets/*", (c: any) => c.text("Asset not found", 404));

  app.use("/*.jpg", serveStatic({ root: distPath }));
  app.use("/*.png", serveStatic({ root: distPath }));
  app.use("/*.svg", serveStatic({ root: distPath }));
  app.use("/*.ico", serveStatic({ root: distPath }));

  // PWA files — must be served as their real content (NOT the SPA index.html),
  // or the app won't install as a phone app. Service worker stays uncached so
  // updates propagate; manifest gets the right content-type; TWA asset-links
  // (Play Store) live under /.well-known.
  app.use("/sw.js", serveStatic({
    root: distPath,
    onFound: (_p: string, c: any) => c.header("Cache-Control", "no-cache, no-store, must-revalidate"),
  }));
  app.use("/manifest.webmanifest", serveStatic({
    root: distPath,
    onFound: (_p: string, c: any) => c.header("Content-Type", "application/manifest+json"),
  }));
  app.use("/.well-known/*", serveStatic({ root: distPath }));

  // SPA fallback: serve index.html for all non-API routes. Served with
  // no-cache so every deploy's fresh asset hashes are picked up immediately —
  // this is what prevents the "white screen after deploy" cache trap.
  app.get("/*", async (c: any, next: any) => {
    const pathname = c.req.path;
    if (pathname.startsWith("/api/")) return next();
    c.header("Cache-Control", "no-cache, no-store, must-revalidate");
    return serveStatic({ root: distPath, path: "/index.html" })(c, next);
  });
}
