/**
 * FIGGY AI BRAIN — storage I/O over the pure core (api/brain-core.ts).
 * Loads scope-isolated records, runs the brain's reasoning, files missing-info
 * questions, and turns Markie's answers into truth. Raw SQL so it ports straight
 * to Postgres. PERSONAL scope is additionally pinned to a userId here (defense in
 * depth on top of brain-core's scope guard).
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import {
  answerFromBrain, truthFromAnswer, type BrainRecord, type Scope, type Layer, type RecordStatus, type BrainAnswer,
} from "./brain-core";

function rowToRecord(r: any): BrainRecord {
  return {
    id: String(r.id),
    layer: (r.layer || "truth") as Layer,
    scope: { kind: r.scopeKind, clientId: r.clientId ?? undefined },
    label: r.label || "Record",
    text: r.text || "",
    status: (r.status || "approved") as RecordStatus,
    category: r.category ?? undefined,
    sourceLabels: r.sourceLabels ? safeJson(r.sourceLabels) : undefined,
    updatedAt: r.updatedAt ?? undefined,
  };
}
function safeJson(s: string): string[] | undefined { try { const v = JSON.parse(s); return Array.isArray(v) ? v : undefined; } catch { return undefined; } }

/** Load ONLY the records in this scope — isolation enforced in the SQL itself. */
export async function loadScopedRecords(scope: Scope, userId?: number): Promise<BrainRecord[]> {
  const db = getDb();
  let rows: any[];
  if (scope.kind === "client") {
    rows = (await db.all(sql`SELECT * FROM brain_records WHERE scopeKind = 'client' AND clientId = ${scope.clientId ?? -1}`)) as any[];
  } else if (scope.kind === "personal") {
    rows = (await db.all(sql`SELECT * FROM brain_records WHERE scopeKind = 'personal' AND userId = ${userId ?? -1}`)) as any[];
  } else {
    rows = (await db.all(sql`SELECT * FROM brain_records WHERE scopeKind = 'firm'`)) as any[];
  }
  return rows.map(rowToRecord);
}

export type AskResult = BrainAnswer & { filedQuestionId?: number };

/** The main entry every agent uses. Answer from truth, or file a question. */
export async function brainAsk(question: string, scope: Scope, opts?: { userId?: number; askedBy?: string; category?: string }): Promise<AskResult> {
  const records = await loadScopedRecords(scope, opts?.userId);
  const ans = answerFromBrain(question, scope, records, { category: opts?.category });
  if (ans.answered || !ans.missingInfo) return ans;
  const filedQuestionId = await fileQuestion(ans.missingInfo.question, scope, { userId: opts?.userId, askedBy: opts?.askedBy, category: opts?.category });
  return { ...ans, filedQuestionId };
}

/** File a missing-info question (deduped against an existing OPEN one). */
export async function fileQuestion(question: string, scope: Scope, opts?: { userId?: number; askedBy?: string; category?: string }): Promise<number | undefined> {
  const db = getDb();
  const existing = (await db.all(sql`SELECT id FROM brain_questions WHERE status = 'open' AND question = ${question} AND scopeKind = ${scope.kind} AND COALESCE(clientId,-1) = ${scope.clientId ?? -1} LIMIT 1`)) as any[];
  if (existing[0]) return Number(existing[0].id);
  const now = Date.now();
  await db.run(sql`INSERT INTO brain_questions (scopeKind, clientId, userId, question, category, status, askedBy, createdAt)
    VALUES (${scope.kind}, ${scope.clientId ?? null}, ${opts?.userId ?? null}, ${question}, ${opts?.category ?? null}, 'open', ${opts?.askedBy ?? "liv"}, ${now})`);
  const row = (await db.all(sql`SELECT id FROM brain_questions WHERE question = ${question} ORDER BY id DESC LIMIT 1`)) as any[];
  return row[0] ? Number(row[0].id) : undefined;
}

/** Add an approved truth record directly (e.g. seeding, or Markie entering a fact). */
export async function addTruth(input: { scope: Scope; label: string; statement: string; category?: string; sourceLabels?: string[]; userId?: number; layer?: Layer; status?: RecordStatus }): Promise<string> {
  const db = getDb();
  const id = "br_" + (await import("crypto")).randomBytes(10).toString("hex");
  const now = Date.now();
  await db.run(sql`INSERT INTO brain_records (id, layer, scopeKind, clientId, userId, label, text, status, category, sourceLabels, createdAt, updatedAt)
    VALUES (${id}, ${input.layer ?? "truth"}, ${input.scope.kind}, ${input.scope.clientId ?? null}, ${input.userId ?? null}, ${input.label}, ${input.statement}, ${input.status ?? "approved"}, ${input.category ?? null}, ${input.sourceLabels ? JSON.stringify(input.sourceLabels) : null}, ${now}, ${now})`);
  return id;
}

/** Answer a missing-info question → it becomes approved truth (the learning loop). */
export async function answerQuestion(id: number, answer: string, opts?: { label?: string; category?: string }): Promise<{ truthId: string } | { error: string }> {
  const db = getDb();
  const rows = (await db.all(sql`SELECT * FROM brain_questions WHERE id = ${id} LIMIT 1`)) as any[];
  const q = rows[0];
  if (!q) return { error: "question not found" };
  const scope: Scope = { kind: q.scopeKind, clientId: q.clientId ?? undefined };
  const truth = truthFromAnswer({ id: "br_" + (await import("crypto")).randomBytes(10).toString("hex"), scope, label: opts?.label || "Confirmed by Markie", statement: answer, category: opts?.category ?? q.category ?? undefined, sourceLabels: ["Markie"], at: Date.now() });
  const truthId = await addTruth({ scope, label: truth.label, statement: truth.text, category: truth.category, sourceLabels: truth.sourceLabels, userId: q.userId ?? undefined });
  await db.run(sql`UPDATE brain_questions SET status = 'answered', answer = ${answer}, answeredAt = ${Date.now()} WHERE id = ${id}`);
  return { truthId };
}

export async function listOpenQuestions(): Promise<any[]> {
  const db = getDb();
  return (await db.all(sql`SELECT * FROM brain_questions WHERE status = 'open' ORDER BY createdAt DESC LIMIT 200`)) as any[];
}

/** Seed a few real firm-wide truths so the brain answers from day one. Idempotent:
 *  only runs when the brain is empty. These are FIRM scope (not client-specific). */
export async function seedBrain(): Promise<void> {
  const db = getDb();
  const have = (await db.all(sql`SELECT COUNT(*) AS n FROM brain_records`)) as any[];
  if (Number(have[0]?.n || 0) > 0) return;
  const firm: Scope = { kind: "firm" };
  const seeds: { label: string; statement: string; category: string; sourceLabels: string[]; layer?: Layer }[] = [
    { label: "Reconcile SOP", category: "reconcile", sourceLabels: ["Markie 2026-06-26"],
      statement: "When reconciling a bank account in QBO, the month to reconcile is ALWAYS the next month after the 'Last statement ending date' shown. Click 'View statements' to open that next month's statement and read its ending balance. Statements live in QBO when the bank feed is connected (no Hubdoc). Confirm the beginning balance matches, enter the ending balance + date, Start reconciling, get the Difference to $0.00, then get Markie's OK before clicking Finish now." },
    { label: "Figgy Clearing rule", category: "coding", sourceLabels: ["Markie, non-negotiable"],
      statement: "NEVER use the 'Figgy Clearing' account, or any clearing/control account (Accounts Payable, Accounts Receivable, Undeposited Funds, equity), for any transaction or reconciliation. If a workflow seems to want it, stop and ask Markie." },
    { label: "Review gate", category: "policy", sourceLabels: ["Firm golden rule"],
      statement: "Nothing posts, files, or sends without Markie's review. Agents never invent accounts, clients, or data. If confidence is 80% or less, or the answer isn't in the brain, create a review item for Markie instead of acting." },
    { label: "Entities are separate", category: "policy", sourceLabels: ["Firm golden rule"],
      statement: "Clark OS (Owen Sound) and Clark CW (Collingwood) are permanently separate entities and books — never merge them. Judge a client by the bill-to and location on the document, never the sender or folder." },
  ];
  for (const s of seeds) {
    await addTruth({ scope: firm, label: s.label, statement: s.statement, category: s.category, sourceLabels: s.sourceLabels, layer: s.layer });
  }
  console.log(`[brain] seeded ${seeds.length} firm truths`);
}

export async function brainStats(): Promise<{ records: number; truth: number; openQuestions: number }> {
  const db = getDb();
  const rec = (await db.all(sql`SELECT COUNT(*) AS n FROM brain_records`)) as any[];
  const tru = (await db.all(sql`SELECT COUNT(*) AS n FROM brain_records WHERE layer='truth' AND status='approved'`)) as any[];
  const q = (await db.all(sql`SELECT COUNT(*) AS n FROM brain_questions WHERE status='open'`)) as any[];
  return { records: Number(rec[0]?.n || 0), truth: Number(tru[0]?.n || 0), openQuestions: Number(q[0]?.n || 0) };
}
