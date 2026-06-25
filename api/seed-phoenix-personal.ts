/**
 * PHOENIX PERSONAL SEED — pulls Markie's personal records from his Drive
 * "Operations / Phoenix Rising" folders into the private Phoenix life hub.
 * =============================================================================
 * Transcribed (2026-06-25) from the Sage Health Master Record + Personal Finance
 * / Travel folders. PRIVATE: inserted only under the owner's userId (life_entries
 * are never shared). Idempotent via a meta sentinel so it won't duplicate or
 * clobber anything Markie adds himself. The server can't read Drive at runtime,
 * so the content is captured here and seeded at boot.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { users, lifeEntries } from "../db/schema";
import { eq } from "drizzle-orm";

const SENTINEL = "phoenix-personal";
const drive = (id: string) => `https://drive.google.com/file/d/${id}/view`;
const safeMeta = (s: any): any => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };

type E = { section: string; type: string; title: string; subtitle?: string; date?: string; notes?: string };

const ENTRIES: E[] = [
  // ---- Health ----
  { section: "health", type: "provider", title: "Dr. Elliot Lass — Primary Care", subtitle: "Wilson Medical Group",
    notes: "303–343 Wilson Avenue, North York, ON M3H1T1" },
  { section: "health", type: "condition", title: "Type 2 Diabetes (well-managed — HbA1c in non-diabetic range)" },
  { section: "health", type: "condition", title: "Inflammation, neuropathy, joint pain, high blood pressure (monitoring), chronic fatigue, limited mobility" },
  { section: "health", type: "metric", title: "HbA1c 5.5% — NORMAL", date: "2026-05-14",
    subtitle: "3-month blood sugar avg", notes: "Non-diabetic range (<6.0%). Dynacare order #6659346251, Dr. Lass." },
  { section: "health", type: "metric", title: "Triglycerides 2.12 mmol/L — HIGH", date: "2026-05-14",
    subtitle: "Only abnormal lab (target <1.70)", notes: "Plan: more omega-3 (salmon 3×/wk, walnuts), less refined carbs/sugar, more fiber, 8+ glasses water." },
  { section: "health", type: "medication", title: "Daily supplements",
    notes: "AM: Omega-3 1000–2000mg, Vitamin D3 2000–4000 IU, probiotic. With meals: turmeric curcumin. PM: magnesium glycinate. Berberine — PENDING Dr. Lass approval (interacts with diabetes meds)." },
  { section: "health", type: "document", title: "Blood work — May 14 2026 (PDF)",
    notes: drive("1qPzLcWydWSq6bfBELBp6dgG-nnmcHvlg") },
  { section: "health", type: "document", title: "Sage Health Master Record",
    notes: "https://docs.google.com/document/d/1WAGnTFE-Lk8-G9nN0v1qtvBsg6W7_njeRNAfiHb1SY4/edit" },

  // ---- Milestones (health goals as how he wants to be doing & feeling) ----
  { section: "milestones", type: "feeling", title: "More energy" },
  { section: "milestones", type: "feeling", title: "Better sleep" },
  { section: "milestones", type: "feeling", title: "Mental clarity — less brain fog" },
  { section: "milestones", type: "doing", title: "Improve mobility" },
  { section: "milestones", type: "doing", title: "Lose weight at a safe 1–2 lbs/week" },

  // ---- Finance ----
  { section: "finance", type: "note", title: "Freedom Mobile settlement offer",
    notes: drive("1gGrJ-CZvkxB5S_7dE4HGdvSfjAF8JnXc9_dGB6lO1pw") },

  // ---- Travel ----
  { section: "travel", type: "document", title: "Karma Campervans booking — Toronto (#U-YYZ-8573)",
    notes: drive("1G_6C6sUHWr5I67nONKd8lSVsp8sQiHrp") },
];

export async function seedPhoenixPersonal(): Promise<{ seeded: boolean; count?: number } | void> {
  const db = getDb();
  try {
    const us = (await db.select().from(users)) as any[];
    if (!us.length) return { seeded: false };
    const owner = us.find((u) => /markie@gofig\.ca|markie\.antle@gmail/i.test(u.email || ""))
      || us.filter((u) => u.role === "admin").sort((a, b) => a.id - b.id)[0]
      || us[0];

    const existing = (await db.select().from(lifeEntries).where(eq(lifeEntries.userId, owner.id))) as any[];
    if (existing.some((e) => safeMeta(e.meta).seed === SENTINEL)) return { seeded: false };

    const meta = JSON.stringify({ seed: SENTINEL });
    for (const e of ENTRIES) {
      await db.insert(lifeEntries).values({
        userId: owner.id, section: e.section, type: e.type, title: e.title,
        subtitle: e.subtitle ?? null, date: e.date ? new Date(e.date + "T12:00:00") : null,
        notes: e.notes ?? null, meta, createdAt: new Date(), updatedAt: new Date(),
      } as any);
    }
    console.log(`[phoenix-personal] seeded ${ENTRIES.length} entries for ${owner.email}`);
    return { seeded: true, count: ENTRIES.length };
  } catch (err) {
    console.error("[phoenix-personal] failed:", err instanceof Error ? err.message : err);
  }
}
