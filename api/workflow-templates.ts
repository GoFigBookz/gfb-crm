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
  { key: "onboarding", name: "New Client Onboarding", category: "Setup", steps: [
    "Signed engagement letter on file",
    "CRA Represent-a-Client (RAC) access",
    "Collect compliance numbers (CRA / HST / Payroll / WSIB)",
    "Connect QBO + bank feeds",
    "Connect Hubdoc / document flow",
    "Chart of accounts review",
    "Catch-up plan (if behind)",
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
