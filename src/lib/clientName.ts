// Client display-name splitting for the UI.
//
// Markie's preference (2026-06-21): show the OPERATING / trade name as the main
// (bold) name, with the numbered legal entity on a second line underneath —
// e.g. for "Sher-E-Punjab (1001196626 Ontario Ltd.)" render
//   Sher-E-Punjab          <- primary (bold)
//   1001196626 Ontario Ltd. <- secondary (muted, underneath)
//
// Stored shape (see api/client-name.ts + import-client-master.ts):
//   name    = "Trade (Numbered Legal)"   (operating-name-first)
//   company = "Numbered Legal"           (the legal entity)
// This splitter is order-agnostic: it finds whichever part is the numbered
// legal entity and pushes it to the secondary line, so it works no matter how
// the name happens to be stored. Numbered companies with NO trade name are left
// as a single primary line (there's no trade name to promote).

// 6+ digit number followed by Ontario/Canada + Inc/Ltd/Corp(oration).
const NUMBERED = /\d{5,}\s+(?:ontario|canada)\s+(?:inc|ltd|corp|corporation)\.?/i;

export function isNumberedEntity(s: string | null | undefined): boolean {
  return !!s && NUMBERED.test(s.trim());
}

export interface ClientNameParts {
  primary: string;            // the bold main name (trade name when available)
  secondary: string | null;   // the numbered legal entity, shown underneath
}

export function splitClientName(name?: string | null, company?: string | null): ClientNameParts {
  const n = (name ?? "").trim();
  const c = (company ?? "").trim();
  if (!n) return { primary: c || "", secondary: null };

  // Case 1: "A (B)" — one part is the trade name, the other the legal entity.
  const m = n.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (m) {
    const a = m[1].trim();
    const b = m[2].trim();
    if (isNumberedEntity(b) && !isNumberedEntity(a)) return { primary: a, secondary: b };
    if (isNumberedEntity(a) && !isNumberedEntity(b)) return { primary: b, secondary: a };
    return { primary: a, secondary: b || null }; // neither clearly numbered — keep order
  }

  // Case 2: no parens in name — use company as the partner field.
  if (c && c.toLowerCase() !== n.toLowerCase()) {
    if (isNumberedEntity(n) && !isNumberedEntity(c)) return { primary: c, secondary: n };
    if (isNumberedEntity(c) && !isNumberedEntity(n)) return { primary: n, secondary: c };
  }

  // Plain name (or a bare numbered company with no trade name).
  return { primary: n, secondary: null };
}
