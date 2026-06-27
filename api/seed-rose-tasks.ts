/**
 * ROSE LIQUIDATION — execution checklist (Markie 2026-06-27: "get the agents set
 * up… both [ingest AND execute]"). Materializes the Rose Liquidation Master Plan
 * (Drive › Agents folder) as concrete tasks assigned to Skye so the campaign is
 * lined up on the board, with the steps that NEED Markie clearly flagged.
 * =============================================================================
 * Personal side-sale (Phoenix Rising) — clientId stays NULL, scoped to Markie.
 * Idempotent: only seeds when no 'rose-resale' task exists yet.
 * Honest constraint: the agents can draft copy/listings + research, but the
 * accounts (Shopify, marketplaces) and product photos need Markie — those tasks
 * say so instead of pretending the agent can do them.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { tasks } from "../db/schema";
import { sql } from "drizzle-orm";

export async function seedRoseLiquidationTasks(): Promise<void> {
  const db = getDb();
  void users; void or; void eq;
  const markie = (await db.all(sql`SELECT id FROM users WHERE email IN ('markie.antle@gmail.com','markie@gofig.ca') OR role = 'admin' ORDER BY (role = 'admin') DESC, id ASC LIMIT 1`)) as any[];
  const userId = markie[0]?.id ? Number(markie[0].id) : null;
  if (userId == null) { console.log("[rose] no Markie user — skipped Rose seed"); return; }

  // Seed the Rose product into the Side-Sales inventory so listings can be drafted
  // immediately (idempotent — independent of the task guard below). Pricing from the
  // Rose Liquidation plan; MIN floor left at 0 for Markie to set his cost back.
  try {
    const existing = (await db.all(sql`SELECT id FROM side_products WHERE userId=${userId} AND active=1 AND lower(name) LIKE '%rose%' LIMIT 1`)) as any[];
    if (!existing.length) {
      await db.run(sql`INSERT INTO side_products (userId, name, category, qtyOnHand, givenAway, unitCost, minPrice, targetPrice, discreet, notes, active, createdAt, updatedAt)
        VALUES (${userId}, 'Rose Wellness Massager', 'Wellness', 150, 0, 0, 0, 39.99, 1, 'Brand new & sealed. Sale $29.99 / 2 for $50 (free ship on 2). Discreet packaging, ships from Canada. SET your MIN floor (cost back) on this card.', 1, ${Date.now()}, ${Date.now()})`);
      console.log("[rose] seeded Rose product into side_products");
    }
  } catch { /* side_products table may not exist yet — seeds next boot */ }

  // Task checklist — its own guard (independent of the product seed above).
  const have = (await db.all(sql`SELECT COUNT(*) AS n FROM tasks WHERE category = 'rose-resale'`)) as any[];
  if (Number(have[0]?.n || 0) > 0) return;

  const day = 86_400_000;
  const due = (n: number) => new Date(Date.now() + n * day);
  // [title, dueInDays, priority, needsMarkie, description]
  const steps: [string, number, "high" | "medium" | "low", boolean, string][] = [
    ["Rose: finalize pricing + bundle offer", 1, "high", false,
      "Lock the liquidation offer per the plan: $29.99/unit + flat-rate shipping, 2 for $50 with free shipping. Skye confirms flat-rate amount vs. unit margin so a single sale still clears cost."],
    ["Rose: draft Shopify store copy (Home/Product/FAQ/Contact)", 2, "high", false,
      "Skye drafts the simple clearance store: clearance banner, product description, benefits (rechargeable/quiet/soft-touch/compact/travel), trust badges (Ships from Canada / Brand New & Sealed / Discreet Packaging / Secure Checkout), FAQ. Copy ready for Markie to paste into Shopify."],
    ["Rose: set up Shopify store + product photos — NEEDS MARKIE", 3, "high", true,
      "Needs Markie: a Shopify account + product photos of the sealed unit (discreet). Skye supplies the copy/layout; Markie creates the store + uploads photos. Blocker until then."],
    ["Rose: draft marketplace listings (FB/Kijiji/eBay/Craigslist)", 2, "high", false,
      "Skye writes per-channel listings (Brand New, Factory Sealed, Canadian Seller, Discreet Shipping). Note Facebook Marketplace 'where permitted' — wellness/intimate items have policy limits; Skye checks each channel's rules and flags any that disallow the listing."],
    ["Rose: marketplace accounts + post listings — NEEDS MARKIE", 4, "medium", true,
      "Needs Markie: marketplace accounts (FB/Kijiji/eBay) and the go-ahead to post. Skye provides ready-to-paste listings + photos; Markie posts (or approves Skye to, once accounts are connected)."],
    ["Rose: solicit REAL reviews (do NOT use the AI drafts)", 5, "medium", false,
      "Collect genuine reviews from actual buyers as sales happen. The 500 AI-generated 'reviews' in the Agents folder are DRAFTS/SAMPLES ONLY — never publish them as real (Markie's standing rule). Use them only as tone/format inspiration for review-request wording."],
    ["Rose: daily posting + response cadence", 6, "medium", false,
      "Liquidation depends on consistent daily posting + fast responses across channels. Skye sets a simple daily cadence and tracks units sold vs. the ~200 target (2–4 week goal) in the Phoenix Rising side-sales tracker."],
  ];

  for (const [title, d, priority, needsMarkie, description] of steps) {
    await db.run(sql`INSERT INTO tasks (userId, clientId, title, description, dueDate, priority, status, completed, assignedTo, category, createdAt, updatedAt)
      VALUES (${userId}, ${null}, ${title}, ${description}, ${due(d).getTime()}, ${priority}, 'pending', 0, 'Skye', 'rose-resale', ${Date.now()}, ${Date.now()})`);
  }
  console.log(`[rose] seeded ${steps.length} Rose liquidation tasks (Skye)`);
}
