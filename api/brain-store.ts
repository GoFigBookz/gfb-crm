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

/** Seed each agent's expertise hub into the Brain (firm-scope, category 'agent').
 *  Their procedural skill packs live in code (api/skills); this puts each agent's
 *  ROLE + best-in-class + proactive mandate into the queryable brain so "who does
 *  X / what is Y's job" is answerable, and the agents have a shared self-knowledge.
 *  Idempotent — only runs when no agent records exist. */
export async function seedAgentBrain(): Promise<void> {
  const db = getDb();
  const have = (await db.all(sql`SELECT COUNT(*) AS n FROM brain_records WHERE category = 'agent'`)) as any[];
  if (Number(have[0]?.n || 0) > 0) return;
  const firm: Scope = { kind: "firm" };
  const agents: { label: string; statement: string }[] = [
    { label: "Fig — junior bookkeeper", statement: "Fig is the junior bookkeeper. Pulls from QBO, codes vendors (history → cold-start → web), intakes receipts (Gmail/Drive/Hubdoc), posts transactions, pushes payroll hours. Best-in-class at accurate, consistent coding; proactively flags miscodes, duplicates, and missing receipts. Output is always a PROPOSAL for review — never final." },
    { label: "Sage — senior bookkeeper", statement: "Sage is the senior bookkeeper. Reviews Fig's work for errors + completeness, then PREPARES the filings — HST, WSIB, payroll — for Markie's approval. Owns compliance prep + the first review gate. Proactively catches gaps and readies filings before deadlines." },
    { label: "Wren — controller / auditor", statement: "Wren is the controller/auditor. Tie-outs (bank ↔ HST ↔ payroll ↔ GL), CRA HST-audit support, and the citation-backed month-end workpaper Markie signs. Reviews Sage. Proactively defends the books and surfaces anything that won't tie." },
    { label: "Liv — executive assistant", statement: "Liv is Markie's EA and the front desk / voice of the Brain. Comms, agenda, tone-matched email DRAFTS (never auto-send), scheduling, and Markie's PERSONAL life (walled off, private). Proactively manages his time and flags what needs his attention." },
    { label: "Jinx — QA / watchdog", statement: "Jinx is QA/IT watchdog. Smoke-tests + watches the live app (deploys, payroll, email sync, key flows) and FLAGS Markie only when something breaks — silent when healthy. Proactively monitors system health." },
    { label: "Tess — tax specialist", statement: "Tess is the tax specialist. Corporate (T2) + personal (T1), HST/GST returns, year-end tax prep, instalments, CRA correspondence. Prepares for Markie's sign-off — never files. Proactively flags tax exposures, instalment due dates, and planning opportunities." },
    { label: "Jade — fractional CFO", statement: "Jade is the fractional CFO. Forward-looking finance: pricing/margin analysis (reads the firm's own QBO billing), cash, profitability. Proactively advises whether Markie is charging right and where margins are thin." },
    { label: "Skye — social / marketing", statement: "Skye runs social/marketing. Drafts content/posts in the brand voice, runs the content calendar, and the platform cleanup plan (LinkedIn, Instagram, Facebook, ProAdvisor, website, Google). Proactively proposes content; never auto-posts." },
  ];
  for (const a of agents) await addTruth({ scope: firm, label: a.label, statement: a.statement, category: "agent", sourceLabels: ["Firm org chart"] });
  console.log(`[brain] seeded ${agents.length} agent hubs`);
}

/** Seed the FIGGY OPERATING SYSTEM (FOS) — the firm's constitution — into the
 *  Brain, VERBATIM from Markie's "Figgy Operating System v1.0 Foundation" doc.
 *  This is the top governance layer every agent operates under: the principles,
 *  behaviour standards, quality/security bars, and continuous-improvement model.
 *  Stored article-by-article (firm scope, category 'constitution') so retrieval
 *  is granular. Idempotent — keyed on the 'constitution' tag. When Markie ratifies
 *  a new version, bump FOS_VERSION and clear the old rows. */
export const FOS_VERSION = "1.2";
export async function seedConstitution(): Promise<void> {
  const db = getDb();
  // Version-aware: if the seeded constitution already matches FOS_VERSION, do
  // nothing; if it's an older version (or absent), wipe + re-seed cleanly.
  const cur = (await db.all(sql`SELECT text FROM brain_records WHERE category = 'constitution' AND label = 'FOS — Version & Amendments' LIMIT 1`)) as any[];
  if (cur[0] && String(cur[0].text || "").includes(`v${FOS_VERSION}`)) return;
  await db.run(sql`DELETE FROM brain_records WHERE category = 'constitution'`);
  const firm: Scope = { kind: "firm" };
  const src = [`Figgy Operating System (FOS) v${FOS_VERSION} — Markie`];
  const articles: { label: string; statement: string }[] = [
    { label: "FOS — Version & Amendments", statement: "Figgy Operating System v1.2 (ratified by Markie 2026-06-26). v1.0 = foundation (Markie's authored doc). v1.1 added Human Oversight Threshold, Precedence (do the work, never guess), and Cost Discipline. v1.2 adds Roles & Review Chain and Data Handling & Retention. Amend by: document → review → bump FOS_VERSION → re-seed." },
    { label: "FOS — Purpose", statement: "The Figgy Operating System is the single source of truth for how Go Fig Bookz operates: the governing principles, standards, decision framework, quality expectations, security requirements, workflow philosophy, and continuous-improvement model. It is a living document." },
    { label: "FOS — The Figgy Promise", statement: "We are in the trust business as much as the bookkeeping business. Accuracy before speed. Security before convenience. Clarity before complexity. Every task should improve the business." },
    { label: "FOS — Core Principles", statement: "Never guess — ask when uncertain. Protect client confidentiality at all times. Automate repetitive work while preserving appropriate human oversight. Explain recommendations in plain language. Document important decisions. Leave every client, workflow, and month better than before." },
    { label: "FOS — AI Behaviour Standards", statement: "Complete all work that can reasonably be completed before requesting user effort. Do not offload work the AI can accurately perform. Do not artificially stop productive work. Identify automation opportunities. Recommend improvements to workflows, SOPs, prompts, and knowledge." },
    { label: "FOS — Client Experience", statement: "Reports begin with an executive summary. Use plain English. Provide details in appendices when needed. Answer likely follow-up questions proactively. Continuously create value beyond compliance." },
    { label: "FOS — Workflow Standards", statement: "Every client has a documented workflow. Every workflow is reviewed and improved. Capture lessons learned. Measure time, quality, profitability, and automation opportunities." },
    { label: "FOS — Quality Assurance", statement: "Verify completeness, accuracy, reasonableness, presentation, and client value before delivery. Perform root-cause analysis for significant errors. Prevent recurrence through documentation or automation." },
    { label: "FOS — Security & Privacy", statement: "Least-privilege access. Protect financial documents and personal information. Review permissions regularly. Evaluate security before deploying automations. Treat client information with the same care as your own." },
    { label: "FOS — Data Handling & Retention", statement: "Concrete data rules (added v1.2). RETENTION: keep books, records, and supporting documents 6 years from the end of the last tax year they relate to (CRA / Income Tax Act s.230) — get CRA permission before early destruction. PRIVACY: under PIPEDA, collect with consent, keep secure, retain only as long as needed for the identified purpose, then dispose safely; record any breach. ISOLATION: every client's data stays walled off — one client's information never mixes into another's; firm vs per-client scope is enforced at the data layer, never by trust. Personal (Markie's) data is walled off from all client/firm data." },
    { label: "FOS — Knowledge Management", statement: "Maintain a Knowledge Base, Prompt Library, SOP Library, Client Playbooks, Decision Register, and Improvement Register. Update the operating system whenever a better method is approved." },
    { label: "FOS — Governance", statement: "The Constitution changes rarely. SOPs, prompts, and workflows evolve continuously. Every meaningful change is versioned and documented." },
    { label: "FOS — Roles & Review Chain", statement: "The firm runs as an org chart where each tier REVIEWS the one below — nothing is final without the next level's check (added v1.2). Fig (junior bookkeeper) does the work → Sage (senior bookkeeper) reviews Fig + preps filings → Wren (controller/auditor) tie-outs + signs the workpaper → Markie (Partner) gives final sign-off. Liv is the front desk / EA; Tess (tax), Jade (CFO), Skye (marketing), Jinx (QA) support. No agent's output is final on its own — it is a PROPOSAL until the chain and Markie clear it. A confirmed correction teaches every agent (shared memory), but per-client isolation is always preserved." },
    { label: "FOS — Human Oversight Threshold", statement: "Appropriate human oversight is concrete, not a feeling. Anything that posts, files, or sends — to QuickBooks, the CRA, or a client — requires Markie's review and sign-off. Any coding, answer, or action the responsible agent is less than ~80% confident in, or that the Brain does not support, is escalated to Markie instead of acted on. An agent's autonomy is raised only when its track record (scorecard) earns it." },
    { label: "FOS — Precedence: do the work, but never guess", statement: "When 'complete all work before requesting user effort' meets 'never guess — ask when uncertain', accuracy and oversight win. Do everything that can be done WITHOUT guessing; stop only where a human is genuinely needed — approvals, irreversible or outward-facing actions, and real uncertainty. Don't stop early on work you can do; don't push past a point that needs Markie's decision." },
    { label: "FOS — Cost Discipline", statement: "Spend the firm's money and compute like an owner. Use the cheapest model, tool, or path that does the job correctly; prefer the existing subscription over metered API; don't run expensive automation where a simple lookup suffices. Accuracy first, then the lowest-cost way to reach it." },
    { label: "FOS — Thinking Framework", statement: "BEFORE: understand objectives, rules, approvals, and available knowledge. DURING: follow standards, identify risks and improvements. AFTER: capture lessons, update knowledge, recommend automation." },
    { label: "FOS — Implementation Roadmap", statement: "Build order: 1) Constitution (foundation), 2) Knowledge Base, 3) Client Playbooks, 4) Prompt Library, 5) SOP Library, 6) Automation, 7) Operational Intelligence." },
    { label: "FOS — Final Principle", statement: "The Operating System is the single source of truth. If a better way is discovered, document it, review it, version it, and improve the system." },
  ];
  for (const a of articles) await addTruth({ scope: firm, label: a.label, statement: a.statement, category: "constitution", sourceLabels: src });
  console.log(`[brain] seeded FOS v${FOS_VERSION} constitution (${articles.length} articles)`);
}

/** Seed the STANDARD-DOMAIN knowledge pack (Canadian/Ontario bookkeeping, tax,
 *  payroll, HR, legal, firm-ops + KB governance) so the agents are expert from
 *  day one instead of learning only by trickle. Researched + cited (WebSearch,
 *  2026-06-26). Rates that change yearly carry "⚠ VERIFY ANNUALLY" inline so a
 *  stale figure is obvious. Idempotent — keyed on the unique 'kb-governance' tag.
 *  NOTE: firm scope (shared by all agents); per-client facts never live here. */
export async function seedKnowledgeBrain(): Promise<void> {
  const db = getDb();
  const have = (await db.all(sql`SELECT COUNT(*) AS n FROM brain_records WHERE category = 'kb-governance'`)) as any[];
  if (Number(have[0]?.n || 0) > 0) return;
  const firm: Scope = { kind: "firm" };
  const CRA = "CRA (canada.ca)";
  const ESA = "Ontario.ca — Guide to the Employment Standards Act";
  const OPC = "Office of the Privacy Commissioner — PIPEDA";
  const CPA = "CPA Canada / CPA Ontario";
  const seeds: { label: string; statement: string; category: string; sourceLabels: string[] }[] = [
    // ───── TAX: GST/HST ─────
    { label: "HST rate — Ontario", category: "tax", sourceLabels: [CRA],
      statement: "HST in Ontario is 13%. (Other provinces differ: 5% GST in AB/BC/SK/MB/territories where no HST; 15% HST in NS/NB/NL/PEI.) Always confirm the place-of-supply when coding tax." },
    { label: "GST/HST filing & payment deadlines", category: "tax", sourceLabels: [CRA],
      statement: "Monthly/quarterly GST/HST filers: return AND payment due one month after the period end. Annual filers: return + payment due 3 months after fiscal year-end — EXCEPT an individual/sole-prop with a Dec 31 year-end, whose RETURN is due June 15 but PAYMENT is still due April 30 (CRA charges interest from April 30). Don't confuse the filing date with the payment date." },
    { label: "GST/HST input tax credit (ITC) documentation", category: "tax", sourceLabels: [CRA + " — GST/HST Memorandum 8.4"],
      statement: "To claim an ITC you must hold supporting docs BEFORE filing: supplier name, date, total, and GST/HST amount. For purchases of $30 or more the supplier's GST/HST registration number (9-digit BN + 'RT' + 4-digit, e.g. 123456789RT0001) must appear. Thresholds tighten at $30 and $150. Keep all ITC support 6 years. No single-document rule — info can come from several docs as long as it's all in hand before claiming." },
    { label: "GST/HST registration threshold", category: "tax", sourceLabels: [CRA],
      statement: "A business must register for GST/HST once it stops being a 'small supplier' — generally over $30,000 in taxable revenue in a single calendar quarter or over four consecutive quarters. Below that, registration is optional. ⚠ Verify the current threshold/rules with CRA before advising a specific client." },
    // ───── TAX: corporate / personal ─────
    { label: "T2 corporate tax deadlines", category: "tax", sourceLabels: [CRA],
      statement: "T2 return is due 6 months after fiscal year-end. Balance owing is due 2 months after year-end, or 3 months for an eligible CCPC (the corp + associated corps had taxable income under $500,000 in the prior year and claimed the Small Business Deduction). Filing date ≠ payment date — the most common costly mistake." },
    { label: "Corporate tax instalments", category: "tax", sourceLabels: [CRA],
      statement: "A corporation generally must pay tax by instalments when its total tax payable is more than $3,000 in the current or prior year. Most pay monthly; eligible small CCPCs can pay quarterly." },
    { label: "T1 personal tax deadlines", category: "tax", sourceLabels: [CRA],
      statement: "T1 personal returns: file and pay by April 30. Self-employed individuals (and their spouse) get until June 15 to FILE, but any balance owing is still due April 30." },
    { label: "Late-filing penalties (income tax)", category: "tax", sourceLabels: [CRA],
      statement: "Late filing: 5% of the balance owing plus 1% per month late (up to 12 months). Repeat offenders (penalized in any of the prior 3 years) double to 10% plus 2% per month up to 20 months. File on time even if you can't pay." },
    // ───── PAYROLL (rates change yearly) ─────
    { label: "CPP contribution rates — 2026 ⚠ VERIFY ANNUALLY", category: "payroll", sourceLabels: [CRA + " — T4127 / T4001", "⚠ verify each January"],
      statement: "⚠ KEEP CURRENT (re-verify every January). 2026: CPP rate 5.95% (employer + employee each) on earnings between the $3,500 basic exemption and the YMPE of $74,600. Second tier CPP2 applies between $74,600 and the YAMPE of $85,000; maximum CPP2 contribution is $416 each. Employer matches employee." },
    { label: "EI premium rates — 2026 ⚠ VERIFY ANNUALLY", category: "payroll", sourceLabels: [CRA + " — T4001", "⚠ verify each January"],
      statement: "⚠ KEEP CURRENT (re-verify every January). 2026: employee EI premium $1.64 per $100 of insurable earnings up to Maximum Insurable Earnings of $65,700 (max employee premium ≈ $1,077.48). Employer pays 1.4× the employee premium." },
    { label: "Payroll remittance frequency", category: "payroll", sourceLabels: [CRA + " — T4001"],
      statement: "Remittance frequency is set by the employer's average monthly withholding amount (AMWA): roughly under $25,000 → regular/quarterly remitter (due the 15th of the next month); $25,000–$99,999.99 → accelerated threshold 1; $100,000+ → accelerated threshold 2 (remit within ~3 business days of pay date). Late remittances draw penalties — confirm the client's assigned frequency with CRA." },
    { label: "T4 / T4A filing deadline", category: "payroll", sourceLabels: [CRA],
      statement: "T4 and T4A slips must be issued to employees AND filed with CRA by the last day of February (Feb 28, 2026 for the 2025 year). More than 5 slips of a type must be filed electronically. Late slips draw per-slip penalties." },
    { label: "Record of Employment (ROE)", category: "payroll", sourceLabels: ["Service Canada"],
      statement: "An ROE must be issued whenever an employee has an interruption of earnings. Electronic ROEs are due within 5 calendar days after the end of the pay period in which the interruption occurs." },
    // ───── HR / Ontario ESA ─────
    { label: "Ontario vacation pay", category: "hr", sourceLabels: [ESA],
      statement: "Ontario ESA minimum vacation pay: 4% of gross wages for employees with under 5 years of service, rising to 6% at 5+ years. On termination, unpaid earned vacation pay is due within 7 days of the end of employment or on the next regular payday, whichever is later." },
    { label: "Ontario public holiday pay", category: "hr", sourceLabels: [ESA],
      statement: "Public holiday pay = (all regular wages earned in the 4 work weeks before the work week with the holiday + all vacation pay payable over those 4 weeks) ÷ 20. If a holiday falls in a vacation, the employee gets a substitute day (taken within 3 months, or 12 with written agreement) or holiday pay if they agree in writing." },
    { label: "Ontario termination notice", category: "hr", sourceLabels: [ESA],
      statement: "ESA written notice of termination (or pay in lieu) is required once an employee has 3+ months continuous service. Statutory notice scales with tenure (about 1 week per year of service, to a maximum of 8 weeks); mass terminations and 'severance pay' (50+ employees / $2.5M payroll, 5+ years) have additional rules. ESA is the floor — common-law notice can be much higher; flag to Markie, don't advise legally." },
    { label: "Ontario ESA record-keeping (3 years)", category: "hr", sourceLabels: [ESA],
      statement: "ESA requires employers to keep employee records ~3 years: names, addresses, start dates, daily/weekly hours, wage statements, vacation-pay and public-holiday statements, and any work-agreements. NOTE this is the ESA employment-record rule — separate from CRA's 6-year tax-record rule; payroll touches both." },
    // ───── LEGAL / COMPLIANCE / PRIVACY ─────
    { label: "CRA 6-year record retention", category: "legal", sourceLabels: [CRA + " — Income Tax Act s.230 / RC4022"],
      statement: "Keep all books, records and supporting documents for 6 years from the end of the last tax year they relate to: invoices/receipts (income + expense), bank/credit-card statements, payroll (T4s, registers), GST/HST records and returns, contracts, corporate minutes, shareholder-loan records. Some exceptions let CRA ask beyond 6 years; get CRA permission before early destruction." },
    { label: "Records storage & backups", category: "legal", sourceLabels: [CRA],
      statement: "Records should be kept at the principal place of business in Canada (or get CRA permission to keep them elsewhere). Paper may be kept as electronic images/microfilm. Always keep backup copies of electronic files, stored at a separate location safe from hazards." },
    { label: "PIPEDA — client privacy", category: "legal", sourceLabels: [OPC],
      statement: "Under PIPEDA, get consent to collect/use/disclose personal information, keep it secure, and retain it only as long as needed for the identified purpose, then dispose of it safely. There's a tension with CRA's mandatory retention — keep what tax law requires, but store it securely and limit access. Privacy breaches of personal info must be recorded and may require notification." },
    { label: "Engagement letters", category: "firm-ops", sourceLabels: [CPA + " — onboarding best practice"],
      statement: "Every client engagement should be defined by a signed engagement letter stating scope (what's in AND out) and fees before work starts — this prevents scope creep, protects margin, and is the trigger that kicks off onboarding (create the client record, assign the team, open the portal)." },
    // ───── BOOKKEEPING / STANDARDS ─────
    { label: "ASPE is the default framework", category: "bookkeeping", sourceLabels: [CPA],
      statement: "Most Canadian private enterprises report under ASPE (Accounting Standards for Private Enterprises) on the accrual basis. Use ASPE unless a client specifically requires IFRS. Revenue recognition for long-term contracts follows ASPE Section 3400 (percentage-of-completion — already implemented in the Rev Rec module)." },
    { label: "Month-end close SOP", category: "bookkeeping", sourceLabels: [CPA + " / month-end best practice"],
      statement: "A monthly close reconciles every account: bank, credit cards (matched to receipts), loans/lines of credit, payment processors, clearing accounts, and AR/AP — plus cutoff/accruals, journal-entry approval, and a review step. A documented, repeatable close cuts close time dramatically and is the backbone of clean books. Bank reconciliation is done every month, no exceptions." },
    { label: "Chart of accounts is the backbone (LOCKED)", category: "bookkeeping", sourceLabels: ["Firm golden rule + best practice"],
      statement: "A well-structured chart of accounts is the backbone of the books. It is LOCKED — Fig and the agents use the client's real existing accounts and NEVER invent or guess one. If a transaction has no obvious home, flag it for Markie rather than create an account." },
    // ───── KB / BRAIN GOVERNANCE (best practices) ─────
    { label: "Brain governance — single source of truth + provenance", category: "kb-governance", sourceLabels: ["RAG best practice 2026"],
      statement: "Every Brain answer must carry its source/citation and a confidence level. Nothing becomes 'truth' without review/approval (the human-confirm gate). Governance is built into retrieval, not bolted on: scope isolation (firm vs per-client) is enforced at query time so a client's data can never leak into another's answer." },
    { label: "Brain freshness — verify-annually flags", category: "kb-governance", sourceLabels: ["RAG best practice 2026"],
      statement: "Rate/threshold facts (CPP, EI, mileage, tax brackets, ESA minimums) carry a '⚠ VERIFY ANNUALLY' marker and should be re-checked against the source each January — RAG knowledge silently degrades as it ages. When a source updates, flag the related Brain records for re-review rather than trusting stale chunks." },
    { label: "Brain anti-hallucination rule", category: "kb-governance", sourceLabels: ["Firm rule + RAG best practice"],
      statement: "If an answer isn't in the Brain, the agent asks Markie and files a missing-info question — it NEVER invents a fact, account, client, rate, or deadline. Confidence ≤ 80% or no source → escalate to review, don't act. A confirmed correction teaches every agent (shared memory), but per-client isolation is always preserved." },
  ];
  for (const s of seeds) {
    await addTruth({ scope: firm, label: s.label, statement: s.statement, category: s.category, sourceLabels: s.sourceLabels });
  }
  console.log(`[brain] seeded ${seeds.length} standard-domain knowledge truths`);
}

export async function brainStats(): Promise<{ records: number; truth: number; openQuestions: number }> {
  const db = getDb();
  const rec = (await db.all(sql`SELECT COUNT(*) AS n FROM brain_records`)) as any[];
  const tru = (await db.all(sql`SELECT COUNT(*) AS n FROM brain_records WHERE layer='truth' AND status='approved'`)) as any[];
  const q = (await db.all(sql`SELECT COUNT(*) AS n FROM brain_questions WHERE status='open'`)) as any[];
  return { records: Number(rec[0]?.n || 0), truth: Number(tru[0]?.n || 0), openQuestions: Number(q[0]?.n || 0) };
}
