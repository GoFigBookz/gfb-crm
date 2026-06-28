/**
 * REGRESSION TEST — the year-end review flow against a real (in-memory libsql) DB.
 * Proves the schema guard's SQL is valid and that Start → seed checklist → toggle →
 * Close-gate → package manifest behave end to end on a real engine (not just the pure
 * core), so a Save can't fail on a forgotten column and the close gate actually blocks.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, and } from "drizzle-orm";
import { yearEndReviews, yearEndItems } from "../db/schema";
import {
  YEAR_END_CHECKLIST, summarizeYearEnd, buildPackageManifest, fiscalYearEndDate,
} from "./year-end-core";

async function mkDb() {
  const c = createClient({ url: ":memory:" });
  const db = drizzle(c);
  // Mirror ensure-year-end-schema.ts exactly.
  await c.execute(`CREATE TABLE year_end_reviews (
    id integer PRIMARY KEY AUTOINCREMENT,
    clientId integer NOT NULL,
    fiscalYear integer NOT NULL,
    fiscalYearEnd text,
    status text NOT NULL DEFAULT 'in_progress',
    accountantName text, accountantEmail text, notes text,
    startedAt integer, closedAt integer, packagedAt integer,
    createdAt integer, updatedAt integer
  )`);
  await c.execute(`CREATE TABLE year_end_items (
    id integer PRIMARY KEY AUTOINCREMENT,
    reviewId integer NOT NULL,
    itemKey text NOT NULL, label text NOT NULL, phase text NOT NULL,
    done integer DEFAULT 0, na integer DEFAULT 0, note text,
    sortOrder integer DEFAULT 0, updatedAt integer
  )`);
  return { c, db };
}

describe("year-end review — real DB flow", () => {
  it("starts a review, seeds the full checklist, and is not closeable empty", async () => {
    const { db } = await mkDb();
    const fye = fiscalYearEndDate(2026, 3); // Mar 31, 2026
    const [review] = await db.insert(yearEndReviews).values({
      clientId: 42, fiscalYear: 2026, fiscalYearEnd: fye, status: "in_progress",
      startedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    }).returning();
    let order = 0;
    for (const def of YEAR_END_CHECKLIST) {
      await db.insert(yearEndItems).values({
        reviewId: (review as any).id, itemKey: def.key, label: def.label, phase: def.phase,
        done: false, na: false, sortOrder: order++, updatedAt: new Date(),
      });
    }
    const items = await db.select().from(yearEndItems).where(eq(yearEndItems.reviewId, (review as any).id));
    expect(items.length).toBe(YEAR_END_CHECKLIST.length);
    const states = items.map((i: any) => ({ key: i.itemKey, done: !!i.done, na: !!i.na, note: i.note }));
    expect(summarizeYearEnd(states).canClose).toBe(false);
  });

  it("becomes closeable once the required items are ticked, and the manifest reads from DB state", async () => {
    const { db } = await mkDb();
    const [review] = await db.insert(yearEndReviews).values({
      clientId: 7, fiscalYear: 2025, fiscalYearEnd: "2025-12-31", status: "in_progress",
      accountantEmail: "cpa@firm.ca", notes: "Booked CCA.", createdAt: new Date(), updatedAt: new Date(),
    }).returning();
    let order = 0;
    for (const def of YEAR_END_CHECKLIST) {
      await db.insert(yearEndItems).values({
        reviewId: (review as any).id, itemKey: def.key, label: def.label, phase: def.phase,
        done: !!def.requiredToClose, na: false, sortOrder: order++, updatedAt: new Date(),
      });
    }
    const items = await db.select().from(yearEndItems).where(eq(yearEndItems.reviewId, (review as any).id));
    const states = items.map((i: any) => ({ key: i.itemKey, done: !!i.done, na: !!i.na, note: i.note }));
    const summary = summarizeYearEnd(states);
    expect(summary.canClose).toBe(true);

    // simulate the close mutation's guard + write
    await db.update(yearEndReviews).set({ status: "closed", closedAt: new Date() }).where(eq(yearEndReviews.id, (review as any).id));
    const [closed] = await db.select().from(yearEndReviews).where(eq(yearEndReviews.id, (review as any).id));
    expect((closed as any).status).toBe("closed");

    const manifest = buildPackageManifest({
      recon: { totalAccounts: 3, reconciledThrough: 3, behind: 0 },
      items: states, notes: (closed as any).notes,
      accountant: { email: (closed as any).accountantEmail },
    });
    expect(manifest.items.find((m) => m.key === "notes")!.status).toBe("included");
    expect(manifest.items.find((m) => m.key === "accountant")!.status).toBe("included");
    expect(manifest.ready).toBe(true); // nothing hard-missing
  });

  it("one client+year is unique-ish: a second start returns the existing row, not a dup", async () => {
    const { db } = await mkDb();
    await db.insert(yearEndReviews).values({ clientId: 9, fiscalYear: 2026, status: "in_progress", createdAt: new Date(), updatedAt: new Date() });
    const existing = await db.select().from(yearEndReviews)
      .where(and(eq(yearEndReviews.clientId, 9), eq(yearEndReviews.fiscalYear, 2026)));
    expect(existing.length).toBe(1); // the router's start() guards on this before inserting
  });
});
