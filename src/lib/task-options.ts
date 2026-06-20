/**
 * Shared task pick-lists. Titles are SUGGESTIONS (used as a <datalist>) — every
 * field stays free-type/editable; the dropdown just saves typing for the
 * standard things a bookkeeper does every month.
 */
export const TASK_CATEGORIES = [
  "Bookkeeping", "HST", "Payroll", "Year-End", "Reconciliation",
  "Sales", "Setup", "Client", "Admin", "Other",
];

export const ASSIGNEES = ["Markie", "Rachelle"];

export const STANDARD_TASK_TITLES = [
  // Monthly bookkeeping
  "Import & categorize transactions",
  "Review uncategorized transactions",
  "Reconcile bank account(s)",
  "Reconcile credit card(s)",
  "Reconcile loan / line of credit",
  "Request missing receipts from client",
  "Post adjusting journal entries",
  "Prepare monthly financial statements",
  "Send monthly reports to client",
  "Monthly check-in call",
  // Accounts payable / receivable
  "Enter & pay bills (A/P)",
  "Create & send invoices (A/R)",
  "Follow up on overdue invoices",
  "Record bank deposits",
  // HST / sales tax
  "Reconcile HST for the period",
  "Prepare HST/GST return",
  "File HST/GST return with CRA",
  "Record HST payment / refund",
  // Payroll
  "Process payroll",
  "Review & approve payroll",
  "Remit payroll source deductions (PD7A)",
  "Prepare Record of Employment (ROE)",
  "Prepare & file T4 / T4A slips",
  "Prepare & file T5 slips",
  "Print & email pay stubs",
  // Compliance / remittances
  "WSIB reconciliation & remittance",
  "EHT remittance",
  "Corporate tax instalment",
  // Year-end
  "Confirm year-end date & scope",
  "Reconcile all accounts to year-end",
  "Review fixed assets & amortization",
  "Prepare year-end working papers",
  "Send year-end package to accountant",
  "Record accountant's adjusting entries",
  // Setup / onboarding
  "Set up new client",
  "Signed engagement letter on file",
  "CRA Represent-a-Client (RAC) access",
  "Collect compliance numbers (CRA/HST/Payroll/WSIB)",
  "Connect QBO + bank feeds",
  "Connect Hubdoc / document flow",
  "Chart of accounts review",
  "Catch-up bookkeeping",
];
