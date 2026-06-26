/**
 * SEED HERITAGE — load Markie's ancestry into Phoenix Rising so it's never lost.
 * Adds the three known family lines to the Family (genealogy) section and a personal
 * Brain record summarizing the heritage (+ pointers to the Drive doc and DNA files).
 * Idempotent (guard on the Fitzpatrick line for the owner). Source: Markie's
 * "Heritage & Ancestry Export v1" (2026-06-26).
 *
 * seedHeritageLineage() — adds the REAL named direct ancestors from the v2 "Family
 * History Living Book" (GEDCOM export 11 Jun 2026) so the Family History tab is a real
 * tree, not just three line summaries. Separately guarded (on "Louise M. Walsh") so it
 * runs once even though the v1 LINES already exist. Source HTML living book saved to
 * Drive (Phoenix Rising). Markie 2026-06-26.
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

/** Real named direct ancestors from the v2 Living Book (GEDCOM 11 Jun 2026). */
const ANCESTORS: { name: string; relation: string; side: string; birthDate?: string; deathDate?: string; birthplace?: string; notes?: string }[] = [
  { name: "Joseph Mark Fitzpatrick", relation: "Father", side: "paternal", birthDate: "1 Oct 1949", deathDate: "12 Jun 2012", birthplace: "Goose Cove, NL", notes: "Markie's father. Died in Bedell, Carleton County, New Brunswick. Parents: Daniel Dorsey Fitzpatrick + Valeda Carroll." },
  { name: "Olivera Antle", relation: "Mother", side: "maternal", birthDate: "24 Aug 1949", birthplace: "Fleur de Lys, NL", notes: "Markie's mother. Parents: Michael T. Antle + Louise M. Walsh." },
  { name: "Daniel Dorsey Fitzpatrick", relation: "Grandfather (paternal)", side: "paternal", birthDate: "24 Dec 1913", deathDate: "14 Oct 2005", birthplace: "Goose Cove, St. Barbe's, NL", notes: "Parents: Mark Joseph Fitzpatrick + Bridget Murrin." },
  { name: "Valeda Carroll", relation: "Grandmother (paternal)", side: "paternal", birthDate: "5 Nov 1914", deathDate: "14 Mar 1999", birthplace: "White Bay, NL", notes: "Parents: John Carroll + Cecelia Bartlett." },
  { name: "Michael T. Antle", relation: "Grandfather (maternal)", side: "maternal", birthDate: "26 Sep 1915", deathDate: "4 Jan 1990", birthplace: "Fleur de Lys, White Bay District, NL", notes: "Married Louise M. Walsh (1937). Parents: Thomas Patrick Antle + Elizabeth Traverse. Anchored by Fleur de Lys cemetery/census records." },
  { name: "Louise M. Walsh", relation: "Grandmother (maternal)", side: "maternal", birthDate: "23 Apr 1915", deathDate: "24 Nov 1989", birthplace: "Coachman's Cove, NL", notes: "Died Baie Verte, NL. Parents: David Walsh + Alice Francis Traverse. The anchor of the Coachman's Cove chapter; her brother Alphonsus Patrick Walsh served in the Newfoundland Regiment and died 9 Mar 1942 (WWII)." },
  // Great-grandparents (the proof spine + the two open brick walls).
  { name: "Mark Joseph Fitzpatrick", relation: "Great-grandfather", side: "paternal", birthDate: "21 Mar 1880", deathDate: "14 Jan 1959", birthplace: "Conche, NL", notes: "Married Bridget Murrin 7 Sep 1905, Goose Cove. Parents: James Fitzpatrick + Bridget Kearsey (Kearley)." },
  { name: "Bridget Murrin", relation: "Great-grandmother", side: "paternal", birthDate: "14 Aug 1877", deathDate: "17 Feb 1936", birthplace: "Goose Cove, NL", notes: "Parents: Joseph Murrin + Bridget Allen." },
  { name: "John Carroll", relation: "Great-grandfather", side: "paternal", birthDate: "1882", deathDate: "1964", birthplace: "Griquet, NL", notes: "Married Cecelia Bartlett 24 Oct 1913, Fortune Harbor; later Margt Corbin 1915. Parents: Thomas Carroll." },
  { name: "Cecelia Bartlett", relation: "Great-grandmother", side: "paternal", birthDate: "1894", deathDate: "13 May 1917", birthplace: "Quirpon, NL", notes: "Parents: Daniel Bartlett + Catherine Pike." },
  { name: "Thomas Patrick Antle", relation: "Great-grandfather", side: "maternal", birthDate: "1872", deathDate: "7 Mar 1945", birthplace: "Brigus, NL", notes: "Married Elizabeth Traverse 8 Jan 1900, Coachman's Cove (proven). HIS PARENTS ARE THE MAIN BRICK WALL — unproven; mine sibling-descendant trees (Sarah/Robert/Agatha/Bridget/Mary/Thomas/Irene Antle)." },
  { name: "Elizabeth Traverse", relation: "Great-grandmother", side: "maternal", birthDate: "31 Aug 1877", deathDate: "26 Jan 1921", birthplace: "Goose Cove, NL", notes: "Parents: Robert Traverse + Ellen Ward." },
  { name: "David Walsh", relation: "Great-grandfather", side: "maternal", birthDate: "14 May 1889", deathDate: "26 Dec 1969", birthplace: "Coachman's Cove, NL", notes: "Married Alice Francis Traverse 11 Sep 1911, Coachman's Cove. Parents: John Louis Walsh + Mary Frances Dobbin. The Walsh line points toward John Walsh of County Wexford, Ireland (b.1760) — a research lead, not yet proven." },
  { name: "Alice Francis Traverse", relation: "Great-grandmother", side: "maternal", birthDate: "9 Aug 1891", deathDate: "20 Mar 1965", birthplace: "Coachman's Cove, NL", notes: "Parents: John Traverse + Clara Downey. Cousin relationship to Elizabeth Traverse still to be reconstructed." },
];

export async function seedHeritageLineage(): Promise<void> {
  const db = getDb();
  try {
    const owner = (await db.all(sql`SELECT id FROM users WHERE role='admin' ORDER BY id ASC LIMIT 1`)) as any[];
    const fb = owner[0] ? owner : ((await db.all(sql`SELECT id FROM users ORDER BY id ASC LIMIT 1`)) as any[]);
    const uid = fb[0]?.id;
    if (!uid) return;

    const have = (await db.all(sql`SELECT COUNT(*) AS n FROM family_members WHERE userId=${uid} AND name='Louise M. Walsh'`)) as any[];
    if (Number(have[0]?.n || 0) > 0) return;

    const now = Date.now();
    for (const a of ANCESTORS) {
      await db.run(sql`INSERT INTO family_members (userId, name, relation, side, living, birthDate, deathDate, birthplace, notes, createdAt, updatedAt)
        VALUES (${uid}, ${a.name}, ${a.relation}, ${a.side}, 0, ${a.birthDate ?? null}, ${a.deathDate ?? null}, ${a.birthplace ?? null}, ${a.notes ?? null}, ${now}, ${now})`);
    }
    // Personal Brain record — the queryable lineage summary (so Liv can answer "who were my great-grandparents?").
    await addTruth({
      scope: { kind: "personal" }, userId: uid, layer: "memory", category: "heritage",
      label: "Family History — Living Book (v2)",
      statement: "Markie's documented direct line (GEDCOM 11 Jun 2026, 'From Fleur de Lys to Coachman's Cove'): FATHER Joseph Mark Fitzpatrick (1949-2012, Goose Cove NL). MOTHER Olivera Antle (b.1949, Fleur de Lys NL). PATERNAL grandparents Daniel Dorsey Fitzpatrick (1913-2005) + Valeda Carroll (1914-1999). MATERNAL grandparents Michael T. Antle (1915-1990) + Louise M. Walsh (1915-1989, Coachman's Cove). The tree reaches back through Newfoundland (Fleur de Lys, Coachman's Cove, Goose Cove, Conche, Griquet, Brigus, Keels, Harbour Grace) to Ireland and Dorset/England by the 1700s — incl. John Walsh of County Wexford (b.1760, a research lead) and Patrick Fitzpatrick of Mullinavat, Kilkenny (b.1775). PROVEN anchors: Michael+Louise (Fleur de Lys cemetery/census); Patrick Antle married Elizabeth Traverse 8 Jan 1900 Coachman's Cove; David Walsh+Alice Traverse as Louise's parents; Alphonsus Patrick Walsh (Louise's brother) served Newfoundland Regiment, died 9 Mar 1942 (WWII). MAIN BRICK WALL: Thomas Patrick Antle's parents (unproven) — mine sibling-descendant trees. Full tree saved to Drive: 'Phoenix Rising — Family History Living Book (v2)' (next to the v1 Heritage doc) and seeded into the Family History tab.",
      sourceLabels: ["Markie — Family History Living Book v2 (GEDCOM 11 Jun 2026)"],
    });
    console.log(`[heritage] seeded ${ANCESTORS.length} direct ancestors + lineage brain record for user ${uid}`);
  } catch (e) {
    console.error("[heritage] seedHeritageLineage failed:", e instanceof Error ? e.message : e);
  }
}
