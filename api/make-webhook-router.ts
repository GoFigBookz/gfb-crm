/**
 * MAKE.COM WEBHOOK ROUTER
 * Receives form submissions from Make.com and stores them.
 * 
 * How it works:
 *   1. Markie builds form in Make.com
 *   2. Make.com "HTTP" module POSTs to: https://figgy.gofig.ca/api/make-webhook
 *   3. We store the raw submission
 *   4. Figgy Jr dashboard displays it
 */

import { Hono } from "hono";
import { getDb } from "./queries/connection";
import { makeSubmissions } from "../db/schema";
import { eq, desc } from "drizzle-orm";

const WEBHOOK_SECRET = process.env.MAKE_WEBHOOK_SECRET || "figgy-make-2026";

export const makeWebhookRouter = new Hono();

// GET /api/make-webhook/health — check if endpoint is live
makeWebhookRouter.get("/health", (c) => c.json({ ok: true }));

// POST /api/make-webhook — receive Make.com form submission
makeWebhookRouter.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const db = getDb();

    // Store the raw submission
    const result = await db.insert(makeSubmissions).values({
      source: body.source || "make.com",
      payload: JSON.stringify(body),
      status: "new",
    }).returning();

    return c.json({ success: true, id: result[0].id });
  } catch (e: any) {
    console.error("[Make Webhook] Error:", e);
    return c.json({ success: false, error: e.message }, 500);
  }
});

// GET /api/make-webhook/list — list all submissions (for dashboard)
makeWebhookRouter.get("/list", async (c) => {
  const db = getDb();
  const limit = parseInt(c.req.query("limit") || "50");
  const status = c.req.query("status");

  let query = db.select().from(makeSubmissions).orderBy(desc(makeSubmissions.createdAt)).limit(limit);
  if (status) {
    query = db.select().from(makeSubmissions).where(eq(makeSubmissions.status, status)).orderBy(desc(makeSubmissions.createdAt)).limit(limit);
  }

  const items = await query;
  return c.json({ items, count: items.length });
});

// POST /api/make-webhook/:id/status — update status
makeWebhookRouter.post("/:id/status", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const db = getDb();

  await db.update(makeSubmissions).set({
    status: body.status,
    notes: body.notes,
    updatedAt: new Date(),
  }).where(eq(makeSubmissions.id, id));

  return c.json({ success: true });
});
