/**
 * SEED ENGINEERING AUDIT → IMPROVEMENT REGISTER
 * =============================================================================
 * Purpose:  Load the findings of the 2026-06-26 codebase audit (run against
 *           Markie's 12-rule Engineering & AI Development Standard) into the
 *           firm Improvement Register so they're tracked, not lost.
 * Inputs:   AUDIT_FINDINGS (below) — real, file-pointed findings.
 * Outputs:  firm_registers rows (kind='improvement', author='Engineering Audit').
 * Deps:     firm_registers table (ensure-registers-schema), users table.
 * Errors:   Defensive — logs and returns on any failure; never blocks boot.
 * Idempotent: guarded on author='Engineering Audit' for the owner user.
 * Future:   Once agents log improvements themselves, this becomes a one-off seed.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

type Finding = { rule: number; title: string; file: string; severity: "high" | "medium" | "low"; detail: string };

const AUDIT_FINDINGS: Finding[] = [
  { rule: 9, severity: "high", title: "Write an audit-log entry on every QBO bill/journal post", file: "api/qbo-poster.ts:243-291",
    detail: "postBillFinding/postJournalEntry post real transactions to QBO but never call recordAudit — a posted transaction has no what/when/why/realm trail in agent_audit_log. Add recordAudit on success AND on refusal." },
  { rule: 5, severity: "high", title: "Encrypt connector API keys at rest (Stripe/Wise/Square/PayPal)", file: "api/integration-router.ts:71",
    detail: "connect mutation stores the pasted accessToken/API key in PLAINTEXT, although the schema comments it 'encrypted secret key' and QBO/Jobber tokens use the AES enc:v1: envelope. Run keys through encryptSecret before insert; decrypt on use." },
  { rule: 8, severity: "high", title: "Move hardcoded clientId payroll-seed branching to config", file: "api/payroll-router.ts:663-668",
    detail: "seedFromWorkbook hardcodes `if (clientId === 7)` (Collingwood) and `=== 15||16` (TouchBistro) to pick a seeder in shared code. Drive seeder selection from a per-client playbook/config column, not magic IDs." },
  { rule: 10, severity: "high", title: "Add a vitest suite for the account-selection brain core", file: "api/qbo-vendor-brain-core.ts",
    detail: "The financial coding-decision module is the ONLY *-core.ts with no *.test.ts. The '16/16 checks' are a standalone node script, not run in CI. Add api/qbo-vendor-brain-core.test.ts (decideCoding/decideDedup/normalizeInvoiceNumber)." },
  { rule: 3, severity: "high", title: "Split boot.ts (~2,300 lines, ~68 route handlers) into modules", file: "api/boot.ts",
    detail: "boot.ts mixes server bootstrap, middleware, ~68 inline app.get/post handlers, inline OAuth callbacks and schema-ensure calls. Extract the OAuth callbacks and one-off endpoints into routers; keep boot.ts to wiring." },
  { rule: 3, severity: "high", title: "Break up ClientDashboard.tsx (~3,300 lines, ~146 hooks)", file: "src/pages/ClientDashboard.tsx",
    detail: "Largest frontend file: ~146 hooks and every client tab in one component. Extract each tab into its own component (RevRec/BankedHours tabs already show the pattern) so the page is a thin tab host." },
  { rule: 3, severity: "medium", title: "Modularize payroll-router.ts (~1,090 lines)", file: "api/payroll-router.ts",
    detail: "One router owns roster seeding, workbook parsing, name normalization, rate changes, pay-run lines + hardcoded client branches. Split import/seed helpers out so money-critical pay-run logic is isolated and testable." },
  { rule: 3, severity: "medium", title: "Split Calculators.tsx (~1,650 lines) into per-calculator modules", file: "src/pages/Calculators.tsx",
    detail: "One page bundles every tax/payroll/HST calculator plus an inline provincial-rate table. Break each calculator into its own component; source rates from shared config." },
  { rule: 4, severity: "medium", title: "Centralize the provincial HST/GST rate table", file: "src/pages/Calculators.tsx:43-51 (+ payroll-provincial-2026.ts, tax-rate-autofetch.ts)",
    detail: "ON=0.13 / provincial rates are inline in Calculators and 0.13 literals recur across Receipts, tax-rate-autofetch, payroll-provincial-2026, payroll-tax-core. Define one shared PROVINCIAL_TAX_RATES constant and import everywhere (rule 7: rates change)." },
  { rule: 6, severity: "medium", title: "Connector sync swallows errors as recordsSynced:0", file: "api/connector-router.ts:196-485",
    detail: "Each provider sync catch returns {error, recordsSynced:0} without server-side logging — a silent 0 is indistinguishable from a real zero and could let a month look 'synced' with no data feeding the QBO sales receipt. Log in each catch." },
  { rule: 2, severity: "medium", title: "Add module docblocks to core financial routers", file: "api/connector-router.ts:1; api/payroll-router.ts:1; api/client-router.ts:1; api/onboarding-router.ts:1",
    detail: "Several large money-handling routers start straight at imports with no Purpose/Inputs/Outputs/Errors header (qbo-poster.ts shows the good pattern). connector-router (888 lines) + payroll-router (1,090) are the priority gaps." },
  { rule: 5, severity: "low", title: "Track closing the committed capability-secret webhook URLs", file: "api/bridge-bootstrap.ts:26-34; api/master-sheet-sync.ts:29",
    detail: "Live Make webhook run-URLs for 9 realms + a sheet-sync hook are committed in source. CLAUDE.md documents these as deliberate read-only capability secrets in a private repo (interim bridge) — NOT a new defect; tracking only, to close per-realm as native OAuth replaces the bridge." },
  { rule: 8, severity: "low", title: "Move per-realm CATEGORY_MAPS to a config/seed table", file: "api/qbo-vendor-brain.ts:56-66",
    detail: "CATEGORY_MAPS hardcodes per-realm account/tax mappings (Clark OS/CW realm IDs) in the shared brain module. Correctly realm-keyed + commented (good isolation), but per-client chart mappings are playbook data — move to a per-client config table so adding a client needs no code edit." },
  { rule: 4, severity: "low", title: "Extract repeated connector Bearer-auth fetch boilerplate", file: "api/connector-router.ts:146-347",
    detail: "The `Authorization: Bearer ${apiKey}` fetch pattern repeats 6+ times across Wise/Stripe/Square/PayPal. Factor an authedFetch(provider) helper to standardize auth/base-URL/error handling (also the natural home for the rule-6 logging fix)." },
  { rule: 12, severity: "low", title: "Reconcile schema comment vs actual connector encryption", file: "db/schema.ts:56",
    detail: "Schema documents connectedAccounts.accessToken as 'encrypted secret key' but integration-router stores it plaintext — doc and behaviour disagree. Once the rule-5 fix lands the comment becomes true; until then correct it so reviewers aren't falsely assured." },
];

export async function seedEngineeringAudit(): Promise<void> {
  const db = getDb();
  try {
    // Owner = an admin user (lowest id), else the lowest user id overall.
    const owner = (await db.all(sql`SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`)) as any[];
    const fallback = owner[0] ? owner : ((await db.all(sql`SELECT id FROM users ORDER BY id ASC LIMIT 1`)) as any[]);
    const ownerId = fallback[0]?.id;
    if (!ownerId) return; // no users yet — nothing to attach to

    const have = (await db.all(sql`SELECT COUNT(*) AS n FROM firm_registers WHERE author = 'Engineering Audit' AND userId = ${ownerId}`)) as any[];
    if (Number(have[0]?.n || 0) > 0) return;

    const now = Date.now();
    for (const f of AUDIT_FINDINGS) {
      const body = `[Rule ${f.rule} · ${f.severity.toUpperCase()}] ${f.file}\n${f.detail}`;
      const tags = `engineering, rule ${f.rule}, ${f.severity}`;
      await db.run(sql`INSERT INTO firm_registers (userId, kind, title, body, tags, status, author, active, createdAt, updatedAt)
        VALUES (${ownerId}, 'improvement', ${f.title}, ${body}, ${tags}, 'open', 'Engineering Audit', 1, ${now}, ${now})`);
    }
    console.log(`[registers] seeded ${AUDIT_FINDINGS.length} engineering-audit improvements for user ${ownerId}`);
  } catch (e) {
    console.error("[registers] seedEngineeringAudit failed:", e instanceof Error ? e.message : e);
  }
}
