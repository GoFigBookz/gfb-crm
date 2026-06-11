/**
 * Standalone verification of the brain's pure core, runnable with Node's
 * type-stripping (no test runner needed):  node scripts/brain-verify.ts
 * Mirrors api/qbo-vendor-brain.test.ts; uses REAL Clark OS QBO shapes.
 */
import assert from "node:assert/strict";
import {
  normalizeVendorName,
  normalizeInvoiceNumber,
  vendorNameSimilarity,
  resolveVendorFromCandidates,
  parseBillHistory,
  parseExpenseReport,
  decideCoding,
  decideDedup,
} from "../api/qbo-vendor-brain-core.ts";
import { classifyVendorByName, codingHintForVendor } from "../api/qbo-vendor-classify.ts";

const CLARK_OS_MAP = {
  meals: { accountId: "1150040020", accountName: "Meals & Entertainment", taxCode: "7" },
  fuel: { accountId: "1150040005", accountName: "Fuel", taxCode: "6" },
};

let pass = 0;
const check = (name: string, fn: () => void) => { fn(); pass++; console.log("  ✓", name); };

const WALKER_BILLS = {
  QueryResponse: { Bill: [
    { Id: "890", DocNumber: "17314", TxnDate: "2026-05-12", TotalAmt: 1184.03,
      Line: [{ Amount: 1047.81, DetailType: "AccountBasedExpenseLineDetail",
        AccountBasedExpenseLineDetail: { AccountRef: { value: "1150040016", name: "Parts/Goods COGS" }, TaxCodeRef: { value: "6" } } }] },
    { Id: "892", DocNumber: "17144", TxnDate: "2026-04-27", TotalAmt: 992.56,
      Line: [{ Amount: 878.37, DetailType: "AccountBasedExpenseLineDetail",
        AccountBasedExpenseLineDetail: { AccountRef: { value: "1150040016", name: "Parts/Goods COGS" }, TaxCodeRef: { value: "6" } } }] },
  ] },
};

console.log("normalize / similarity");
check("strips suffixes", () => assert.equal(normalizeVendorName("Walker Aggregates Inc."), "walker aggregates"));
check("identical names score 1", () => assert.equal(vendorNameSimilarity("Walker Aggregates", "WALKER AGGREGATES INC"), 1));
check("different names score 0", () => assert.equal(vendorNameSimilarity("Walker Aggregates", "Home Hardware"), 0));

console.log("resolveVendorFromCandidates");
check("no candidates -> unresolved", () => assert.equal(resolveVendorFromCandidates("Walker", []).status, "unresolved"));
check("single -> resolved 653", () => assert.deepEqual(resolveVendorFromCandidates("Walker Aggregates", [{ Id: "653", DisplayName: "Walker Aggregates" }]), { status: "resolved", vendorId: "653", displayName: "Walker Aggregates" }));
check("clear leader resolves", () => { const r = resolveVendorFromCandidates("Walker Aggregates", [{ Id: "653", DisplayName: "Walker Aggregates" }, { Id: "999", DisplayName: "Walmart" }]); assert.equal(r.status, "resolved"); });
check("two near names -> ambiguous (never guess)", () => assert.equal(resolveVendorFromCandidates("Walker", [{ Id: "1", DisplayName: "Walker Aggregates" }, { Id: "2", DisplayName: "Walker Plumbing" }]).status, "ambiguous"));

console.log("parseBillHistory (real Walker bills)");
check("extracts account+tax", () => { const e = parseBillHistory(WALKER_BILLS); assert.equal(e.length, 2); assert.equal(e[0].accountId, "1150040016"); assert.equal(e[0].taxCode, "6"); });

console.log("parseExpenseReport");
check("skips Bill rows (no double-count)", () => {
  const rep = { Columns: { Column: [{ ColType: "txn_type" }, { ColType: "other_account" }] }, Rows: { Row: [{ type: "Data", ColData: [{ value: "Bill", id: "890" }, { value: "Accounts Payable (A/P)", id: "26" }] }] } };
  assert.equal(parseExpenseReport(rep).length, 0);
});
check("captures expense via other_account, skips -Split-", () => {
  const rep = { Columns: { Column: [{ ColType: "tx_date" }, { ColType: "txn_type" }, { ColType: "doc_num" }, { ColType: "other_account" }, { ColType: "subt_nat_amount" }] },
    Rows: { Row: [
      { type: "Data", ColData: [{ value: "2026-06-03" }, { value: "Expense", id: "876" }, { value: "880281" }, { value: "Parts/Goods COGS", id: "1150040016" }, { value: "21.01" }] },
      { type: "Data", ColData: [{ value: "2026-06-03" }, { value: "Paycheque", id: "863" }, { value: "" }, { value: "-Split-", id: "" }, { value: "-1661.44" }] },
    ] } };
  const e = parseExpenseReport(rep); assert.equal(e.length, 1); assert.equal(e[0].accountId, "1150040016"); assert.equal(e[0].amount, 21.01);
});
check("REAL Clark OS shape: Expense/BillPayment rows posting to A/P are NOT learned (no poisoning)", () => {
  const rep = { Columns: { Column: [{ ColType: "tx_date" }, { ColType: "txn_type" }, { ColType: "doc_num" }, { ColType: "other_account" }, { ColType: "subt_nat_amount" }] },
    Rows: { Row: [
      { type: "Data", ColData: [{ value: "2026-04-07" }, { value: "Expense", id: "410" }, { value: "" }, { value: "Accounts Payable (A/P)", id: "26" }, { value: "1650.96" }] },
      { type: "Data", ColData: [{ value: "2026-03-30" }, { value: "Bill Payment (Credit Card)", id: "391" }, { value: "" }, { value: "Accounts Payable (A/P)", id: "26" }, { value: "592.37" }] },
      { type: "Data", ColData: [{ value: "2026-03-30" }, { value: "Bill", id: "155" }, { value: "914811" }, { value: "Construction COGS", id: "1150040006" }, { value: "592.37" }] },
    ] } };
  assert.equal(parseExpenseReport(rep).length, 0);
});
check("genuine direct credit-card expense to a real account IS learned", () => {
  const rep = { Columns: { Column: [{ ColType: "tx_date" }, { ColType: "txn_type" }, { ColType: "doc_num" }, { ColType: "other_account" }, { ColType: "subt_nat_amount" }] },
    Rows: { Row: [
      { type: "Data", ColData: [{ value: "2026-06-03" }, { value: "Credit Card Expense", id: "878" }, { value: "" }, { value: "Auto Repairs & Maint.", id: "1150040013" }, { value: "95.51" }] },
    ] } };
  const e = parseExpenseReport(rep); assert.equal(e.length, 1); assert.equal(e[0].accountId, "1150040013");
});

console.log("normalizeInvoiceNumber (P0 dedup normalization)");
check("strips spaces/dashes/prefix, uppercases", () => { assert.equal(normalizeInvoiceNumber("inv-17 314"), "17314"); assert.equal(normalizeInvoiceNumber("#CSC-70350"), "CSC70350"); });

console.log("decideCoding (the core rule + P0 confidence/triage/rationale)");
check("no history -> FLAG no_history, red, conf 0", () => { const d = decideCoding([]); assert.equal(d.status, "flag"); assert.equal(d.flagReason, "no_history"); assert.equal(d.triage, "red"); assert.equal(d.confidence, 0); });
check("one account -> suggestion w/ confidence+rationale", () => {
  const d = decideCoding(parseBillHistory(WALKER_BILLS));
  assert.equal(d.status, "suggested"); assert.equal(d.suggestedAccountId, "1150040016"); assert.equal(d.suggestedTaxCode, "6"); assert.equal(d.sampleCount, 2);
  assert.equal(d.confidence, 74); // 60 + 2*7
  assert.equal(d.triage, "yellow"); // below default green threshold 85
  assert.match(d.rationale, /Parts\/Goods COGS/);
});
check("deep clean history -> green (auto-approve-eligible)", () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ accountId: "X", accountName: "Materials", taxCode: "6", source: "bill" as const, date: `2026-0${(i % 9) + 1}-01`, amount: 100, txnId: String(i), docNumber: String(i) }));
  const d = decideCoding(many); assert.equal(d.triage, "green"); assert.equal(d.confidence, 95);
});
check("two+ accounts -> FLAG yellow + ranked rationale", () => {
  const d = decideCoding([
    { accountId: "A", accountName: "Repairs", taxCode: "6", source: "bill", date: "2026-01-01", amount: 100, txnId: "1", docNumber: "1" },
    { accountId: "A", accountName: "Repairs", taxCode: "6", source: "bill", date: "2026-02-01", amount: 100, txnId: "2", docNumber: "2" },
    { accountId: "B", accountName: "Fuel", taxCode: "6", source: "expense", date: "2026-03-01", amount: 50, txnId: "3", docNumber: "3" },
  ]);
  assert.equal(d.status, "flag"); assert.equal(d.flagReason, "multiple_accounts"); assert.equal(d.triage, "yellow");
  assert.deepEqual(d.ranked.map((r) => r.accountId), ["A", "B"]); assert.equal(d.suggestedAccountId, "A");
  assert.equal(d.confidence, 67); // 2/3 dominance
  assert.match(d.rationale, /Repairs/);
});

console.log("classifyVendorByName + codingHintForVendor (cold-start, review-gated)");
check("ESSO -> fuel; Boston Pizza -> meals; Walker -> null", () => {
  assert.equal(classifyVendorByName("ESSO #4821 OWEN SOUND")?.category, "fuel");
  assert.equal(classifyVendorByName("Boston Pizza")?.category, "meals");
  assert.equal(classifyVendorByName("Walker Aggregates"), null);
});
check("hint maps to REAL account + M&E tax 7, low confidence, source=name", () => {
  const h = codingHintForVendor("Tim Hortons #123", CLARK_OS_MAP)!;
  assert.equal(h.accountId, "1150040020"); assert.equal(h.taxCode, "7");
  assert.equal(h.confidence, 40); assert.equal(h.source, "name"); assert.match(h.rationale, /Meals & Entertainment/);
});
check("fuel hint -> Fuel acct + HST 6", () => {
  const h = codingHintForVendor("Petro-Canada", CLARK_OS_MAP)!;
  assert.equal(h.accountId, "1150040005"); assert.equal(h.taxCode, "6");
});
check("never guesses: unrecognized name -> null; category not in chart map -> null", () => {
  assert.equal(codingHintForVendor("Walker Aggregates", CLARK_OS_MAP), null);
  assert.equal(codingHintForVendor("Bell Canada", { fuel: CLARK_OS_MAP.fuel }), null); // telecom not mapped
});
check("web-lookup layer feeds the SAME review-gated hint (source=web)", () => {
  const h = codingHintForVendor("Some Diner LLC", CLARK_OS_MAP, { category: "meals", label: "restaurant" })!;
  assert.equal(h.accountId, "1150040020"); assert.equal(h.source, "web"); assert.match(h.rationale, /web lookup/i);
});

console.log("decideDedup (same lookup, two jobs)");
const existing = [{ docNumber: "17314", amount: 1184.03, date: "2026-05-12", txnId: "890" }];
check("invoice# match -> duplicate", () => { const v = decideDedup({ invoiceNumber: "17314", total: 1184.03, txnDate: "2026-05-12" }, existing); assert.equal(v.isDuplicate, true); assert.equal(v.reason, "invoice_match"); });
check("invoice# match despite formatting (P0 normalization)", () => { const v = decideDedup({ invoiceNumber: "INV-17 314", total: 9.99, txnDate: "2020-01-01" }, existing); assert.equal(v.isDuplicate, true); assert.equal(v.reason, "invoice_match"); });
check("amount+date match -> duplicate", () => { const v = decideDedup({ total: 1184.03, txnDate: "2026-05-13" }, existing); assert.equal(v.isDuplicate, true); assert.equal(v.reason, "amount_date_match"); });
check("different -> not duplicate", () => { const v = decideDedup({ invoiceNumber: "99999", total: 10, txnDate: "2026-05-12" }, existing); assert.equal(v.isDuplicate, false); });

// Web classifier (layer 2) — must be OFF/safe by default (no key + flag unset).
const { classifyVendorByWeb } = await import("../api/qbo-vendor-web-classify.ts");
delete process.env.ANTHROPIC_API_KEY; delete process.env.FIGGY_WEB_CLASSIFY;
assert.equal(await classifyVendorByWeb("Some Unknown Vendor LLC"), null);
pass++; console.log("  ✓ web classifier OFF by default (no key/flag) -> null (safe degrade)");

console.log(`\nALL ${pass} CHECKS PASSED`);
