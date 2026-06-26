/**
 * SEED ROSE RESELLING — give Skye the reselling package + process for the Rose
 * side-product so she owns it and stays proactive. PERSONAL scope (Phoenix Rising,
 * discreet) — walled off from clients/firm. Idempotent (guards on the sentinel
 * label). Source: research + the "Skye — Rose Reselling Package & Process (v1)"
 * Drive doc in the Rose sales folder (2026-06-26).
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { addTruth } from "./brain-store";

const SENTINEL = "Rose reselling — strategy & channel rules (Skye)";
const SOURCE = "Skye — Rose Reselling Package & Process v1 (Drive, Rose sales folder)";

const RECORDS: { label: string; statement: string; category: string }[] = [
  {
    label: SENTINEL, category: "side-sales",
    statement: "ROSE RESELL (Skye, personal/discreet): clear ~150 units of the Rose sexual-wellness product, floor $25/unit. This is a CLEAR-OUT, not a brand build. Strategy = tiered, run in parallel: TIER 1 wholesale/liquidate the lot to a local adult boutique/reseller ($15–18/unit, fastest cash); TIER 2 direct discreet sales via a simple landing page + Interac e-Transfer + discreet shipping ($30–40/unit, best margin); TIER 3 consignment + word-of-mouth/party-plan to mop up. Pricing: single $34.99, 2-pack $59, bundle $44+. Frame as wellness/self-care, never explicit; adults 18+; all sales final (hygiene).",
  },
  {
    label: "Rose reselling — channel & payment HARD RULES", category: "side-sales",
    statement: "DO NOT list the Rose on Facebook Marketplace, Kijiji, Amazon, eBay or Etsy — all prohibit/restrict adult/sexual-wellness items and will pull listings or ban the account. DO NOT take payment via PayPal, Stripe, Square or Shopify Payments — all prohibit adult products (risk a frozen account). COMPLIANT instead: Interac e-Transfer for direct Canadian sales (no processor, no platform to ban you — cleanest for clearing volume); an adult-friendly high-risk processor only if a real store is needed (3.5–5.5% — usually overkill for $3,750 of stock); wholesale/consignment to a bricks-and-mortar adult shop (they hold the merchant account). Reach via adult-friendly channels only — mainstream IG/TikTok/FB ads reject sexual-wellness creative.",
  },
  {
    label: "Rose reselling — Skye's process & what she needs", category: "side-sales",
    statement: "SKYE'S CADENCE: Mon pick the week's channel focus by what moved last week; draft 3 caption/listing variants + 1 boutique outreach (Markie approves before posting/sending — review gate); log every sale in Side Sales (Phoenix Rising); Fri report units sold, $/unit, sell-through %, what's working, next-week rec; flag price drops to keep velocity. SUCCESS = cleared, not engagement (track units remaining from 150, blended $/unit ≥$22, days-to-clear, cash collected). NEEDS FROM MARKIE: product photos in the Rose sales folder; the e-Transfer email (or 'yes' to a landing page); pick opening play (wholesale fast / direct margin / both). Full package: Drive 'Skye — Rose Reselling Package & Process (v1)'.",
  },
];

export async function seedRoseReselling(): Promise<void> {
  const db = getDb();
  try {
    const owner = (await db.all(sql`SELECT id FROM users WHERE role='admin' ORDER BY id ASC LIMIT 1`)) as any[];
    const fb = owner[0] ? owner : ((await db.all(sql`SELECT id FROM users ORDER BY id ASC LIMIT 1`)) as any[]);
    const uid = fb[0]?.id;
    if (!uid) return;
    const have = (await db.all(sql`SELECT id FROM brain_records WHERE scopeKind='personal' AND userId=${uid} AND label=${SENTINEL} LIMIT 1`)) as any[];
    if (have.length) return;
    for (const r of RECORDS) {
      await addTruth({ scope: { kind: "personal" }, userId: uid, layer: "memory", label: r.label, statement: r.statement, category: r.category, sourceLabels: [SOURCE] });
    }
    console.log(`[rose] seeded ${RECORDS.length} reselling records for Skye (user ${uid})`);
  } catch (e) {
    console.error("[rose] seedRoseReselling failed:", e instanceof Error ? e.message : e);
  }
}
