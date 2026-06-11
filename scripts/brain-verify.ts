/**
 * Standalone verification of the brain's pure core, runnable with Node's
 * type-stripping (no test runner needed):  node scripts/brain-verify.ts
 * Mirrors api/qbo-vendor-brain.test.ts; uses REAL Clark OS QBO shapes.
 */
import assert from "node:assert/strict";
import {
  normalizeVendorName,
  vendorNameSimilarity,
  resolveVendorFromCandidates,
  parseBillHistory,
  parseExpenseReport,
  decideCoding,
  decideDedup,
} from "../api/qbo-vendor-brain-core.ts";

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

console.log("decideCoding (the core rule)");
check("no history -> FLAG no_history", () => { const d = decideCoding([]); assert.equal(d.status, "flag"); assert.equal(d.flagReason, "no_history"); });
check("one account -> confident suggestion (real Walker)", () => { const d = decideCoding(parseBillHistory(WALKER_BILLS)); assert.equal(d.status, "suggested"); assert.equal(d.suggestedAccountId, "1150040016"); assert.equal(d.suggestedTaxCode, "6"); assert.equal(d.sampleCount, 2); });
check("two+ accounts -> ALWAYS FLAG with ranked list", () => {
  const d = decideCoding([
    { accountId: "A", accountName: "Repairs", taxCode: "6", source: "bill", date: "2026-01-01", amount: 100, txnId: "1", docNumber: "1" },
    { accountId: "A", accountName: "Repairs", taxCode: "6", source: "bill", date: "2026-02-01", amount: 100, txnId: "2", docNumber: "2" },
    { accountId: "B", accountName: "Fuel", taxCode: "6", source: "expense", date: "2026-03-01", amount: 50, txnId: "3", docNumber: "3" },
  ]);
  assert.equal(d.status, "flag"); assert.equal(d.flagReason, "multiple_accounts");
  assert.deepEqual(d.ranked.map((r) => r.accountId), ["A", "B"]); assert.equal(d.suggestedAccountId, "A");
});

console.log("decideDedup (same lookup, two jobs)");
const existing = [{ docNumber: "17314", amount: 1184.03, date: "2026-05-12", txnId: "890" }];
check("invoice# match -> duplicate", () => { const v = decideDedup({ invoiceNumber: "17314", total: 1184.03, txnDate: "2026-05-12" }, existing); assert.equal(v.isDuplicate, true); assert.equal(v.reason, "invoice_match"); });
check("amount+date match -> duplicate", () => { const v = decideDedup({ total: 1184.03, txnDate: "2026-05-13" }, existing); assert.equal(v.isDuplicate, true); assert.equal(v.reason, "amount_date_match"); });
check("different -> not duplicate", () => { const v = decideDedup({ invoiceNumber: "99999", total: 10, txnDate: "2026-05-12" }, existing); assert.equal(v.isDuplicate, false); });

console.log(`\nALL ${pass} CHECKS PASSED`);
