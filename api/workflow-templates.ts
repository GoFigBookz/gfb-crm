/**
 * FIGGY JR — REUSABLE WORKFLOW TEMPLATES
 * =============================================================================
 * Financial Cents-style: a named checklist of steps you apply to a client to
 * spin up a batch of tasks (e.g. "Monthly Close"). Built-in set for now; each
 * step becomes a task (category-tagged, stage=todo) on apply.
 * =============================================================================
 */
export type WorkflowTemplate = { key: string; name: string; category: string; steps: string[] };

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  { key: "monthly_close", name: "Monthly Close", category: "Bookkeeping", steps: [
    "Import & categorize transactions",
    "Reconcile bank account(s)",
    "Reconcile credit card(s)",
    "Review uncategorized / ask client",
    "Post adjusting entries",
    "Prepare monthly reports (P&L, balance sheet)",
    "Send reports to client",
  ] },
  { key: "year_end", name: "Year-End", category: "Year-End", steps: [
    "Confirm year-end date & scope",
    "Reconcile all accounts to year-end",
    "Review fixed assets & amortization",
    "Prepare year-end working papers",
    "Prepare T4/T5 slips (if applicable)",
    "Send year-end package to accountant",
    "Record accountant's adjusting entries",
  ] },
  // Best-of-breed Canadian (Ontario) new-client onboarding — phased, built from
  // a teardown of Karbon / Financial Cents / TaxDome / Canopy + CRA/WSIB/FINTRAC
  // requirements. See docs/FIGGY_JR_COMPETITIVE_DEEPDIVE.md.
  { key: "onboarding", name: "New Client Onboarding", category: "Setup", steps: [
    // Engagement & compliance
    "Send proposal / scope & pricing summary",
    "Issue & obtain signed engagement letter",
    "KYC / client identity verification (FINTRAC, if handling funds)",
    "Open compliance record file (5-yr retention)",
    // CRA / government access
    "Submit CRA Represent-a-Client (RAC) authorization request",
    "Client confirms RAC authorization in My Business Account (≤10 business days)",
    "Confirm GST/HST (RT) account, filing frequency & deadlines",
    "Confirm payroll (RP) account + source-deduction setup (if employees)",
    "Assess WSIB registration / clearance (if Ontario employees)",
    // Document collection
    "Request incorporation / business registration documents",
    "Request prior-year financial statements + tax returns (1–2 yrs)",
    "Request bank & credit-card statements + void cheque",
    "Request existing books + prior accountant contact",
    "Collect compliance numbers (BN / HST / Payroll / WSIB)",
    // QBO setup
    "Set up / connect QBO, company info & fiscal year-end",
    "Review & tailor chart of accounts (locked COA)",
    "Configure HST sales tax (ON 13%)",
    "Connect bank & credit-card feeds",
    "Enter opening balances (tie to last filed return)",
    // Tools & go-live
    "Set up Hubdoc / Dext receipt capture + sync to QBO",
    "Catch-up / cleanup plan (if behind)",
    "First-period validation & go-live check",
    "Send client welcome email",
  ] },
  { key: "hst_filing", name: "HST Filing", category: "HST", steps: [
    "Reconcile the filing period",
    "Review HST collected vs ITCs",
    "Prepare the HST return",
    "Client review & approve",
    "File with CRA",
    "Record the payment / refund",
  ] },
  { key: "payroll_run", name: "Payroll Run", category: "Payroll", steps: [
    "Collect hours / changes",
    "Process payroll",
    "Review & approve",
    "Submit direct deposit",
    "Remit source deductions (PD7A)",
    "Issue ROE (if needed)",
  ] },
];

export function getWorkflowTemplate(key: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.key === key);
}
