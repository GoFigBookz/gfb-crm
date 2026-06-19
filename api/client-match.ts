/**
 * Resolve a Review-Queue client label (often the full legal name) to a CRM
 * client id. CONSERVATIVE on purpose — only exact / contains / distinctive-city
 * matches — so a document can never be pointed at the WRONG company's books
 * (the two Clark entities are disambiguated by their unique city). Returns null
 * when there's no confident match (the caller then leaves it unlinked).
 */
import { getDb } from "./queries/connection";
import { clients } from "../db/schema";

const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export async function matchClientIdByName(raw: string): Promise<number | null> {
  const t = norm(raw);
  if (!t) return null;
  const all: any[] = await getDb().select().from(clients);

  // 1) exact (normalized) on name OR company
  let hit = all.find((c) => norm(c.name) === t || norm(c.company) === t);
  if (hit) return hit.id;

  // 2) one fully contains the other (length-guarded to avoid loose hits). Guard
  //    BOTH the query and the candidate length: a short query like "USA" must
  //    never substring-match a longer company name ("UNIMAX USA").
  if (t.length >= 6) {
    hit = all.find((c) => {
      const n = norm(c.name), co = norm(c.company);
      return (n.length >= 6 && (t.includes(n) || n.includes(t))) || (co.length >= 6 && (t.includes(co) || co.includes(t)));
    });
    if (hit) return hit.id;
  }

  // 3) distinctive city keyword — unique per Clark entity, so isolation-safe
  for (const kw of ["owen sound", "collingwood"]) {
    if (t.includes(kw)) {
      const c = all.find((x) => `${norm(x.name)} ${norm(x.company)}`.includes(kw));
      if (c) return c.id;
    }
  }
  return null;
}
