/**
 * SEED HERITAGE — load Markie's ancestry into Phoenix Rising so it's never lost.
 * Adds the three known family lines to the Family (genealogy) section and a personal
 * Brain record summarizing the heritage (+ pointers to the Drive doc and DNA files).
 * Idempotent (guard on the Fitzpatrick line for the owner). Source: Markie's
 * "Heritage & Ancestry Export v1" (2026-06-26).
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { addTruth } from "./brain-store";

const LINES = [
  { name: "Fitzpatrick (paternal line)", relation: "Paternal Irish clan", side: "paternal",
    notes: "Ancient Irish Gaelic clan. Gaelic: Mac Giolla Phádraig ('Son of the devotee of Saint Patrick'). Remained a powerful native Gaelic family. Homeland: County Laois, County Kilkenny, ancient Kingdom of Ossory. Represents strength, leadership, resilience, ancient Irish heritage." },
  { name: "Walsh (maternal line)", relation: "Maternal Norman-Irish family", side: "maternal",
    notes: "Original Irish: Breathnach ('The Welshman'). Became one of Ireland's oldest established Norman-Irish families. Areas: County Waterford, Wexford, Kilkenny. Represents Irish heritage, perseverance, family." },
  { name: "Antle (Newfoundland)", relation: "Surname line", side: "self",
    notes: "Established in Newfoundland; earlier European origins still being researched. Birthplace Fleur de Lys, NL — emotional home. Themes: ocean, rugged coastline, resilience, simplicity, family, roots." },
];

export async function seedHeritage(): Promise<void> {
  const db = getDb();
  try {
    const owner = (await db.all(sql`SELECT id FROM users WHERE role='admin' ORDER BY id ASC LIMIT 1`)) as any[];
    const fb = owner[0] ? owner : ((await db.all(sql`SELECT id FROM users ORDER BY id ASC LIMIT 1`)) as any[]);
    const uid = fb[0]?.id;
    if (!uid) return;

    const have = (await db.all(sql`SELECT COUNT(*) AS n FROM family_members WHERE userId=${uid} AND name=${LINES[0].name}`)) as any[];
    if (Number(have[0]?.n || 0) > 0) return;

    const now = Date.now();
    for (const l of LINES) {
      await db.run(sql`INSERT INTO family_members (userId, name, relation, side, living, notes, medicalNotes, createdAt, updatedAt)
        VALUES (${uid}, ${l.name}, ${l.relation}, ${l.side}, 1, ${l.notes}, NULL, ${now}, ${now})`);
    }
    // Personal Brain record (only Markie sees it) — the queryable heritage summary.
    await addTruth({
      scope: { kind: "personal" }, userId: uid, layer: "memory", category: "heritage",
      label: "Heritage & Ancestry",
      statement: "Markie's heritage: PATERNAL Fitzpatrick (ancient Irish Gaelic clan, Mac Giolla Phádraig, Ossory). MATERNAL Walsh (Breathnach, Norman-Irish, Waterford/Wexford/Kilkenny). ANTLE line established in Newfoundland; born Fleur de Lys, NL (emotional home). Heritage symbols: Celtic cross, shamrock, Newfoundland pitcher plant (replaced the Scottish thistle), NL coastline, phoenix (reinvention/resilience), lotus (growth through adversity). Existing purple fleur-de-lis tattoo on the left outer lower leg ABOVE the ankle (untouched; all future work grows upward from it). Full reference: Drive doc 'Phoenix Rising — Heritage & Ancestry (v1)'. DNA files in Drive: dna-data-2017-11-27.zip, dna_story.png, DNA Paternal Sister Match.pdf.",
      sourceLabels: ["Markie — Heritage & Ancestry Export v1"],
    });
    console.log(`[heritage] seeded ${LINES.length} family lines + heritage brain record for user ${uid}`);
  } catch (e) {
    console.error("[heritage] seedHeritage failed:", e instanceof Error ? e.message : e);
  }
}
