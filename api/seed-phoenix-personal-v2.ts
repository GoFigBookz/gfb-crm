/**
 * PHOENIX PERSONAL SEED v2 — richer pull from Markie's Drive "Operations / Phoenix
 * Rising" folders (2026-06-25). Adds the FULL detail the first pass summarized:
 * the complete May-14-2026 lab panel, daily health + exercise protocol, the Dr.
 * Lass appointment questions, the debt-settlement specifics, and the campervan
 * trip details. PRIVATE (owner userId only). Idempotent via its OWN sentinel, so
 * it layers on top of v1 without duplicating it and won't clobber Markie's edits.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { users, lifeEntries } from "../db/schema";
import { eq } from "drizzle-orm";

const SENTINEL = "phoenix-personal-v2";
const drive = (id: string) => `https://drive.google.com/file/d/${id}/view`;
const safeMeta = (s: any): any => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };

type E = { section: string; type: string; title: string; subtitle?: string; date?: string; notes?: string };

const ENTRIES: E[] = [
  // ---- Health profile ----
  { section: "health", type: "profile", title: "Health profile — Markeitha (Markie) Antle",
    subtitle: "DOB Dec 22, 1968 · age 57 · Toronto, ON",
    notes: "Managed with Sage. Conditions: Type 2 Diabetes, severe inflammation, neuropathy, joint pain, limited mobility, high blood pressure (monitoring), chronic fatigue, brain fog." },

  // ---- Full May-14-2026 lab panel (Dynacare #6659346251, Dr. Lass) ----
  { section: "health", type: "metric", title: "Lipid panel — May 14, 2026", date: "2026-05-14",
    subtitle: "All normal except triglycerides",
    notes: "Total cholesterol 4.61 (ref <5.20) ✓ · LDL 2.19 (<3.50) ✓ · HDL 1.61 (≥1.30) ✓ · Non-HDL 3.00 (<4.20) ✓ · Triglycerides 2.12 HIGH (<1.70) ⚠ · Chol/HDL ratio 2.9." },
  { section: "health", type: "metric", title: "Kidney & electrolytes — May 14, 2026", date: "2026-05-14",
    subtitle: "Normal — good kidney function",
    notes: "Creatinine 68 µmol/L (50–100) ✓ · eGFR 90 mL/min (≥60) ✓ · Sodium 139 (136–146) ✓ · Potassium 4.1 (3.7–5.4) ✓. Monitor eGFR + urine ACR annually (diabetes protocol)." },

  // ---- Dr. Lass appointment + questions ----
  { section: "health", type: "appointment", title: "Dr. Elliot Lass — follow-up", date: "2026-05-28",
    subtitle: "Wilson Medical Group, North York · 3:00 PM",
    notes: "Questions: (1) Triglycerides 2.12 — diet only or more frequent monitoring? (2) HbA1c 5.5% — current plan sufficient to maintain? (3) Annual kidney check schedule (eGFR + urine ACR)? (4) Any med adjustments given HbA1c improvement? (5) Berberine OK to add?" },

  // ---- Daily protocol / routines ----
  { section: "health", type: "routine", title: "Daily health protocol",
    notes: "7:00 wake + 10-min bed exercises · 7:30 protein+fiber breakfast · 8:00 AM supplements · 10:00 chair yoga (15m) · 12:30 lunch (Diabetes Plate) · 3:00 4-7-8 breathing · 6:00 dinner (lean protein + veg) · 8:00 PM magnesium · 9:30 relaxation + stretches." },
  { section: "health", type: "routine", title: "Exercise protocol (mobility-friendly)",
    notes: "Morning bed routine (non-negotiable): ankle circles, heel slides, knee-to-chest, arm reaches, pelvic tilts. Chair yoga 3×/wk: mountain, shoulder rolls, cat-cow, forward bend, seated twist, knee lifts. Seated strength as tolerated: marches, leg extensions, thigh squeezes, heel raises, arm circles. Gentle–moderate; progress over perfection." },
  { section: "health", type: "note", title: "Anti-inflammatory diabetes nutrition",
    notes: "Diabetes Plate every meal: ½ non-starchy veg, ¼ lean protein, ¼ high-fiber carbs. Favor: fatty fish, leafy greens, berries, walnuts/flax/chia, legumes, olive oil, turmeric/ginger/cinnamon. For triglycerides: more omega-3 (salmon 3×/wk), less refined carbs/sugar, more fiber, 8+ glasses water. Avoid: processed foods, added sugar, white bread/rice/pasta, fried foods, excess red meat." },
  { section: "health", type: "note", title: "Metrics to track (Sage)",
    notes: "Daily: weight, fasting glucose (4–7 mmol/L), BP, energy (1–10), pain (1–10), water (8), mood, sleep. Weekly: waist, body fat %, steps. Quarterly labs: HbA1c (<7.0%, now 5.5% ✓), lipids (esp. triglycerides <1.70), kidney (eGFR + urine ACR)." },
  { section: "health", type: "document", title: "Previous blood work PDFs (2019–2022)",
    notes: `Jul 2022 Dynacare ${drive("1mydX9OJB8M2iAns6zF0MFVnnjo68fuA-")} · multi-year 2019–2022 ${drive("1KfNtOXhVr8SWkG89Rs7Tb1a6m6KS6TxA")} · Mar 2021 weight-loss labs ${drive("1CaTLNz6iMvk1av2StfAAQiUDHk0WXjsZ")}` },

  // ---- Finance: debt settlement specifics ----
  { section: "finance", type: "note", title: "Freedom Mobile debt — settlement offer (DCA)", date: "2026-05-06",
    subtitle: "Account DF849224 · $250 balance",
    notes: "Sent registered mail May 6 2026 to Debt Control Agency Inc. (3115 Harvester Rd #201, Burlington L7N 3N8). Offer: lump sum as FULL & FINAL settlement, contingent on: (1) accepted as 'paid in full', (2) all collection/interest/legal activity ceases, (3) TransUnion + Equifax updated to $0 / 'Paid in Full' within 30 days, in writing on letterhead before payment. FOLLOW-UP: confirm written acceptance received before paying." },

  // ---- Travel: campervan trip details ----
  { section: "travel", type: "trip", title: "Karma Campervans — Ontario road trip", date: "2025-08-30",
    subtitle: "Aug 30 – Sep 2, 2025 · Toronto (Bolton) · #U-YYZ-8573",
    notes: "Pickup 14124 Highway 50, Bolton L7E 3E2, Sat Aug 30 12:00 PM; drop-off Tue Sep 2 by 11:59 PM. 2-seat queen-bed campervan, 1 traveller, 3 nights, 200km/night. Total CAD $1,004.46. No staff on site — email/phone only. Security deposit $1,000–$5,000 charged 3–7 days before." },
];

export async function seedPhoenixPersonalV2(): Promise<{ seeded: boolean; count?: number } | void> {
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
    console.log(`[phoenix-personal-v2] seeded ${ENTRIES.length} entries for ${owner.email}`);
    return { seeded: true, count: ENTRIES.length };
  } catch (err) {
    console.error("[phoenix-personal-v2] failed:", err instanceof Error ? err.message : err);
  }
}
