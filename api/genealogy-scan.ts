/**
 * GENEALOGY MONTHLY SCAN — Liv grows the family tree on the 28th of each month.
 * =============================================================================
 * Purpose:  Periodically (monthly) search the public web for well-sourced new
 *           relatives, older generations, records and photos for Markie's tree,
 *           and drop them into a REVIEW INBOX (never auto-merged) so the tree
 *           stays accurate. Every finding carries an honest confidence% + proof
 *           level + a source link (Markie's hard requirement).
 * How:      For a bounded set of priority targets (brick walls + oldest gens),
 *           call Claude with the server-side web_search tool; parse the JSON
 *           findings defensively; de-dupe against prior findings; record a run.
 * Gating:   needs ANTHROPIC_API_KEY; opt out with FIGGY_GENEALOGY_SCAN=off.
 *           Model via FIGGY_GENEALOGY_MODEL (default claude-sonnet-4-6 — quality
 *           matters for legacy data, and it runs only ~once a month on a handful
 *           of people, so cost is bounded).
 * Safety:   fully defensive — any failure marks the run 'error' and moves on;
 *           a web hiccup can never corrupt the tree. Nothing merges without
 *           Markie's review (the golden gate).
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import {
  buildScanTargets, buildScanPrompt, parseScanFindings, periodKey,
  resolveProof, type RawFinding, type ScanTarget,
} from "./genealogy-core";

const FAMILY_SURNAMES = ["Antle", "Walsh", "Traverse", "Fitzpatrick", "Dobbin", "Downey", "Carroll", "Murrin", "Kearley", "Bartlett"];
const FAMILY_PLACES = ["Fleur de Lys", "Coachman's Cove", "Goose Cove", "Conche", "Griquet", "Brigus", "Bonavista Bay", "Newfoundland", "County Wexford Ireland"];

function scanEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.FIGGY_GENEALOGY_SCAN !== "off";
}

/** One Claude+web_search research call for a single target. Returns [] on any failure. */
async function researchTarget(target: ScanTarget, model: string, apiKey: string, timeoutMs = 60_000): Promise<RawFinding[]> {
  const { system, user } = buildScanPrompt(target, { surnames: FAMILY_SURNAMES, places: FAMILY_PLACES });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 1800,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const text: string = (data?.content ?? [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => String(b.text ?? ""))
      .join("\n");
    return parseScanFindings(text);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** True if a finding (subject+claim) is already recorded for this user (any status). */
async function findingExists(userId: number, subjectName: string, claim: string): Promise<boolean> {
  const rows = (await getDb().all(sql`
    SELECT 1 FROM genealogy_findings
    WHERE userId=${userId} AND lower(subjectName)=${subjectName.toLowerCase()} AND lower(claim)=${claim.toLowerCase()} LIMIT 1`)) as any[];
  return rows.length > 0;
}

/**
 * Run a scan for one user. `trigger` = 'monthly' | 'manual'. Idempotent per month
 * for the monthly trigger (skips if a run already exists for this period).
 */
export async function runGenealogyScan(userId: number, trigger: "monthly" | "manual", now = new Date()): Promise<{ ok: boolean; findings: number; reason?: string }> {
  const db = getDb();
  const period = periodKey(now);
  if (!scanEnabled()) return { ok: false, findings: 0, reason: "scan disabled (no ANTHROPIC_API_KEY or FIGGY_GENEALOGY_SCAN=off)" };

  if (trigger === "monthly") {
    const existing = (await db.all(sql`SELECT id FROM genealogy_scan_runs WHERE userId=${userId} AND period=${period} AND status IN ('done','running') LIMIT 1`)) as any[];
    if (existing.length) return { ok: false, findings: 0, reason: "already scanned this month" };
  }

  const startedAt = now.getTime();
  await db.run(sql`INSERT INTO genealogy_scan_runs (userId, period, status, trigger, startedAt) VALUES (${userId}, ${period}, 'running', ${trigger}, ${startedAt})`);
  const runRow = (await db.all(sql`SELECT id FROM genealogy_scan_runs WHERE userId=${userId} AND period=${period} ORDER BY id DESC LIMIT 1`)) as any[];
  const runId = runRow[0]?.id;

  try {
    const members = (await db.all(sql`SELECT * FROM family_members WHERE userId=${userId}`)) as any[];
    const targets = buildScanTargets(members, 6);
    const model = process.env.FIGGY_GENEALOGY_MODEL || "claude-sonnet-4-6";
    const apiKey = process.env.ANTHROPIC_API_KEY as string;

    let inserted = 0;
    for (const target of targets) {
      const findings = await researchTarget(target, model, apiKey);
      for (const f of findings) {
        // require a source for anything above a bare clue (accuracy gate)
        if (!f.sourceUrl && f.proofLevel !== "clue" && f.proofLevel !== "wall") continue;
        if (await findingExists(userId, f.subjectName, f.claim)) continue;
        const { level, confidence } = resolveProof(f.proofLevel, f.confidence);
        await db.run(sql`INSERT INTO genealogy_findings
          (userId, scanRunId, subjectName, relatedTo, kind, claim, proofLevel, confidence, sourceType, sourceUrl, birthDate, deathDate, birthplace, status, createdAt)
          VALUES (${userId}, ${runId}, ${f.subjectName}, ${f.relatedTo ?? target.name}, ${f.kind}, ${f.claim}, ${level}, ${confidence},
                  ${f.sourceType ?? null}, ${f.sourceUrl ?? null}, ${f.birthDate ?? null}, ${f.deathDate ?? null}, ${f.birthplace ?? null}, 'new', ${Date.now()})`);
        inserted++;
      }
    }

    const summary = `Scanned ${targets.length} relative(s): ${targets.map((t) => t.name).join(", ")}. ${inserted} new discovery(ies) to review.`;
    await db.run(sql`UPDATE genealogy_scan_runs SET status='done', targetsCount=${targets.length}, findingsCount=${inserted}, summary=${summary}, finishedAt=${Date.now()} WHERE id=${runId}`);
    console.log(`[genealogy] scan ${period} (${trigger}) for user ${userId}: ${inserted} findings`);
    return { ok: true, findings: inserted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.run(sql`UPDATE genealogy_scan_runs SET status='error', error=${msg.slice(0, 500)}, finishedAt=${Date.now()} WHERE id=${runId}`);
    console.error("[genealogy] scan failed:", msg);
    return { ok: false, findings: 0, reason: msg };
  }
}

/**
 * Daily tick (wired in boot): on the 28th of the month, run the scan for the
 * owner(s) who have a family tree, unless this month already ran. No-op otherwise.
 */
export async function maybeRunMonthlyGenealogyScan(now = new Date()): Promise<void> {
  if (now.getDate() !== 28) return;          // Markie's chosen cadence: the 28th
  if (!scanEnabled()) return;
  try {
    const db = getDb();
    // owners who actually have a tree (named people, not just line summaries)
    const owners = (await db.all(sql`SELECT DISTINCT userId FROM family_members WHERE birthDate IS NOT NULL`)) as any[];
    for (const o of owners) {
      await runGenealogyScan(o.userId, "monthly", now).catch(() => {});
    }
  } catch (e) {
    console.error("[genealogy] monthly tick failed:", e instanceof Error ? e.message : e);
  }
}

// ───────────────────────── one-time backfill ─────────────────────────

/** Confidence/proof/generation + parent links for the seeded direct ancestors. */
const LINEAGE: Record<string, { gen: number; proof: string; conf: number; father?: string; mother?: string }> = {
  "Joseph Mark Fitzpatrick": { gen: 1, proof: "likely", conf: 82, father: "Daniel Dorsey Fitzpatrick", mother: "Valeda Carroll" },
  "Olivera Antle": { gen: 1, proof: "likely", conf: 82, father: "Michael T. Antle", mother: "Louise M. Walsh" },
  "Daniel Dorsey Fitzpatrick": { gen: 2, proof: "likely", conf: 80, father: "Mark Joseph Fitzpatrick", mother: "Bridget Murrin" },
  "Valeda Carroll": { gen: 2, proof: "likely", conf: 80, father: "John Carroll", mother: "Cecelia Bartlett" },
  "Michael T. Antle": { gen: 2, proof: "proven", conf: 95, father: "Thomas Patrick Antle", mother: "Elizabeth Traverse" },
  "Louise M. Walsh": { gen: 2, proof: "proven", conf: 95, father: "David Walsh", mother: "Alice Francis Traverse" },
  "Mark Joseph Fitzpatrick": { gen: 3, proof: "likely", conf: 75 },
  "Bridget Murrin": { gen: 3, proof: "likely", conf: 75 },
  "John Carroll": { gen: 3, proof: "likely", conf: 72 },
  "Cecelia Bartlett": { gen: 3, proof: "likely", conf: 72 },
  "Thomas Patrick Antle": { gen: 3, proof: "wall", conf: 60 }, // person documented; PARENTAGE is the brick wall
  "Elizabeth Traverse": { gen: 3, proof: "likely", conf: 75 },
  "David Walsh": { gen: 3, proof: "proven", conf: 90 },
  "Alice Francis Traverse": { gen: 3, proof: "likely", conf: 80 },
};

/** Set proof/confidence/generation + father/mother links on the seeded ancestors (idempotent). */
export async function backfillGenealogyFields(userId: number): Promise<void> {
  const db = getDb();
  try {
    const members = (await db.all(sql`SELECT id, name FROM family_members WHERE userId=${userId}`)) as any[];
    const idByName = new Map<string, number>();
    for (const m of members) idByName.set(String(m.name), m.id);
    for (const [name, info] of Object.entries(LINEAGE)) {
      const id = idByName.get(name);
      if (!id) continue;
      const fatherId = info.father ? idByName.get(info.father) ?? null : null;
      const motherId = info.mother ? idByName.get(info.mother) ?? null : null;
      // only set where still null so we never clobber a manual edit
      await db.run(sql`UPDATE family_members
        SET generation = COALESCE(generation, ${info.gen}),
            proofLevel = COALESCE(proofLevel, ${info.proof}),
            confidence = COALESCE(confidence, ${info.conf}),
            fatherId   = COALESCE(fatherId, ${fatherId}),
            motherId   = COALESCE(motherId, ${motherId})
        WHERE id=${id} AND userId=${userId}`);
    }
  } catch (e) {
    console.error("[genealogy] backfill failed:", e instanceof Error ? e.message : e);
  }
}
