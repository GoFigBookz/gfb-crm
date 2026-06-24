/**
 * PERSONAL CORE — pure helpers for Liv's PRIVATE personal knowledge base.
 * =============================================================================
 * Markie's personal life lives in a space ONLY he sees, run by Liv, fully walled
 * off from client/firm data. This module categorizes facts and builds the
 * context block injected into Liv (and ONLY Liv) so she "knows" his life when he
 * talks to her — without that knowledge ever leaking into other agents' context.
 * No I/O — just pure, testable helpers.
 * =============================================================================
 */

/** Canonical buckets for the personal knowledge base (free-form still allowed). */
export const PERSONAL_CATEGORIES = [
  "people",          // family, friends, contacts and who they are
  "important_dates", // birthdays, anniversaries, renewals
  "health",          // doctors, meds, conditions, appointments
  "home",            // address, utilities, maintenance, services
  "vehicles",        // cars, plates, insurance, service
  "accounts",        // logins/services (NOT passwords), memberships
  "finances",        // personal banking, bills, subscriptions
  "preferences",     // tastes, sizes, likes/dislikes
  "travel",          // trips, loyalty numbers, documents
  "goals",           // personal goals / projects
  "misc",            // anything else / unsorted dump
] as const;

export type PersonalCategory = (typeof PERSONAL_CATEGORIES)[number] | string;

export const CATEGORY_LABELS: Record<string, string> = {
  people: "People",
  important_dates: "Important dates",
  health: "Health",
  home: "Home",
  vehicles: "Vehicles",
  accounts: "Accounts & memberships",
  finances: "Personal finances",
  preferences: "Preferences",
  travel: "Travel",
  goals: "Goals",
  misc: "Misc / inbox",
};

/** Map a loose category guess to a canonical bucket (else "misc"). */
export function normalizeCategory(c: string | null | undefined): PersonalCategory {
  const s = (c || "").toLowerCase().trim().replace(/\s+/g, "_");
  if (!s) return "misc";
  if ((PERSONAL_CATEGORIES as readonly string[]).includes(s)) return s;
  // a few friendly aliases
  if (/(family|kid|child|wife|spouse|partner|friend|contact)/.test(s)) return "people";
  if (/(birthday|anniversary|date|renew)/.test(s)) return "important_dates";
  if (/(doctor|med|health|dentist|prescription)/.test(s)) return "health";
  if (/(car|vehicle|truck|plate|insurance)/.test(s)) return "vehicles";
  if (/(bank|bill|subscription|money|finance)/.test(s)) return "finances";
  if (/(login|account|membership|service|password)/.test(s)) return "accounts";
  if (/(like|prefer|favou?rite|size|taste)/.test(s)) return "preferences";
  if (/(trip|travel|flight|hotel|passport)/.test(s)) return "travel";
  if (/(goal|resolution|project)/.test(s)) return "goals";
  if (/(home|house|address|utility|maintenance)/.test(s)) return "home";
  return "misc";
}

export interface PersonalFact {
  category: string;
  fact: string;
  pinned?: boolean | null;
  createdAt?: number | Date | null;
}

export interface PersonalItemLite {
  kind: string;       // task | reminder | note
  title: string;
  dueDate?: number | Date | null;
  done?: boolean | null;
}

function ms(d: number | Date | null | undefined): number {
  if (d == null) return 0;
  const t = d instanceof Date ? d.getTime() : Number(d);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Select the facts worth putting in Liv's context: pinned first, then most
 * recent, capped so the prompt stays small. Grouped by category for readability.
 */
export function selectPersonalFacts(all: PersonalFact[], limit = 40): PersonalFact[] {
  return [...all]
    .sort((a, b) => {
      const p = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return p !== 0 ? p : ms(b.createdAt) - ms(a.createdAt);
    })
    .slice(0, limit);
}

/**
 * Build the PRIVATE context block injected into Liv only. Returns "" when there's
 * nothing yet. Groups facts by category and lists open personal tasks/reminders.
 */
export function buildPersonalContext(facts: PersonalFact[], openItems: PersonalItemLite[] = []): string {
  const picked = selectPersonalFacts(facts);
  if (!picked.length && !openItems.length) return "";

  const byCat = new Map<string, string[]>();
  for (const f of picked) {
    const c = normalizeCategory(f.category);
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c)!.push(`${f.pinned ? "★ " : ""}${f.fact}`);
  }
  const order = [...PERSONAL_CATEGORIES].filter((c) => byCat.has(c)).concat([...byCat.keys()].filter((c) => !(PERSONAL_CATEGORIES as readonly string[]).includes(c)));

  const lines: string[] = [
    "=== MARKIE'S PERSONAL LIFE (PRIVATE — this is Liv's domain only; NEVER share it with other agents, clients, or mix it with firm work) ===",
  ];
  for (const c of order) {
    lines.push(`${CATEGORY_LABELS[c] ?? c}:`);
    for (const f of byCat.get(c)!) lines.push(`  - ${f}`);
  }
  const open = openItems.filter((i) => i.kind !== "note" && !i.done);
  if (open.length) {
    lines.push("Open personal items:");
    for (const i of open.slice(0, 20)) {
      const due = i.dueDate ? ` (due ${new Date(ms(i.dueDate)).toISOString().slice(0, 10)})` : "";
      lines.push(`  - [${i.kind}] ${i.title}${due}`);
    }
  }
  return lines.join("\n");
}

/**
 * Split a free-text "dump" into individual facts — one per line or bullet. Used
 * when Markie pastes a package about his life for Liv to file. Light cleanup only;
 * Liv re-categorizes from chat. Returns trimmed, de-bulleted, non-empty lines.
 */
export function splitDump(text: string): string[] {
  return (text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•·]\s*/, "").trim())
    .filter((l) => l.length > 1);
}
