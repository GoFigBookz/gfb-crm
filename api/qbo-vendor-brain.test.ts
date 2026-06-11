import { describe, it, expect } from "vitest";
import {
  normalizeVendorName,
  vendorNameSimilarity,
  resolveVendorFromCandidates,
  parseBillHistory,
  parseExpenseReport,
  decideCoding,
  decideDedup,
} from "./qbo-vendor-brain";

// =============================================================================
// Fixtures are REAL responses captured live from Clark OS QBO on 2026-06-11
// (realm 9341456017349963) via the Make QBO API tool, trimmed to shape.
// =============================================================================

const WALKER_BILLS = {
  QueryResponse: {
    Bill: [
      {
        Id: "890", DocNumber: "17314", TxnDate: "2026-05-12", TotalAmt: 1184.03,
        Line: [{ Id: "1", Amount: 1047.81, DetailType: "AccountBasedExpenseLineDetail",
          AccountBasedExpenseLineDetail: { AccountRef: { value: "1150040016", name: "Parts/Goods COGS" }, TaxCodeRef: { value: "6" } } }],
        VendorRef: { value: "653", name: "Walker Aggregates" },
      },
      {
        Id: "892", DocNumber: "17144", TxnDate: "2026-04-27", TotalAmt: 992.56,
        Line: [{ Id: "1", Amount: 878.37, DetailType: "AccountBasedExpenseLineDetail",
          AccountBasedExpenseLineDetail: { AccountRef: { value: "1150040016", name: "Parts/Goods COGS" }, TaxCodeRef: { value: "6" } } }],
        VendorRef: { value: "653", name: "Walker Aggregates" },
      },
    ],
  },
};

const WALKER_REPORT = {
  Header: { ReportName: "TransactionList", Vendor: "653" },
  Columns: { Column: [
    { ColTitle: "Date", ColType: "tx_date" },
    { ColTitle: "Transaction Type", ColType: "txn_type" },
    { ColTitle: "#", ColType: "doc_num" },
    { ColTitle: "Split", ColType: "other_account" },
    { ColTitle: "Amount", ColType: "subt_nat_amount" },
  ] },
  Rows: { Row: [
    // Bills also appear in the report — must be skipped (covered by SQL).
    { type: "Data", ColData: [ { value: "2026-05-12" }, { value: "Bill", id: "890" }, { value: "17314" }, { value: "Accounts Payable (A/P)", id: "26" }, { value: "1184.03" } ] },
  ] },
};

describe("normalizeVendorName / similarity", () => {
  it("strips suffixes and punctuation", () => {
    expect(normalizeVendorName("Walker Aggregates Inc.")).toBe("walker aggregates");
    expect(normalizeVendorName("Clark Pools & Spas Ltd")).toBe("clark pools spas");
  });
  it("scores matching names high and different names low", () => {
    expect(vendorNameSimilarity("Walker Aggregates", "WALKER AGGREGATES INC")).toBe(1);
    expect(vendorNameSimilarity("Walker Aggregates", "Home Hardware")).toBe(0);
  });
});

describe("resolveVendorFromCandidates", () => {
  it("unresolved when no candidates -> FLAG path", () => {
    expect(resolveVendorFromCandidates("Walker", []).status).toBe("unresolved");
  });
  it("single candidate resolves (live: Walker -> 653)", () => {
    const r = resolveVendorFromCandidates("Walker Aggregates", [{ Id: "653", DisplayName: "Walker Aggregates" }]);
    expect(r).toEqual({ status: "resolved", vendorId: "653", displayName: "Walker Aggregates" });
  });
  it("clear leader among several resolves", () => {
    const r = resolveVendorFromCandidates("Walker Aggregates", [
      { Id: "653", DisplayName: "Walker Aggregates" },
      { Id: "999", DisplayName: "Walmart" },
    ]);
    expect(r.status).toBe("resolved");
    expect(r.status === "resolved" && r.vendorId).toBe("653");
  });
  it("two near-identical names -> ambiguous (never guess)", () => {
    const r = resolveVendorFromCandidates("Walker", [
      { Id: "1", DisplayName: "Walker Aggregates" },
      { Id: "2", DisplayName: "Walker Plumbing" },
    ]);
    expect(r.status).toBe("ambiguous");
  });
});

describe("parseBillHistory", () => {
  it("extracts line-level account + tax from real Walker bills", () => {
    const entries = parseBillHistory(WALKER_BILLS);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ accountId: "1150040016", accountName: "Parts/Goods COGS", taxCode: "6", source: "bill", txnId: "890", docNumber: "17314" });
  });
});

describe("parseExpenseReport", () => {
  it("skips Bill rows so they aren't double-counted with SQL", () => {
    expect(parseExpenseReport(WALKER_REPORT)).toHaveLength(0);
  });
  it("captures non-bill expense via other_account, skips -Split-", () => {
    const rep = {
      Columns: { Column: [ { ColType: "tx_date" }, { ColType: "txn_type" }, { ColType: "doc_num" }, { ColType: "other_account" }, { ColType: "subt_nat_amount" } ] },
      Rows: { Row: [
        { type: "Data", ColData: [ { value: "2026-06-03" }, { value: "Expense", id: "876" }, { value: "880281" }, { value: "Parts/Goods COGS", id: "1150040016" }, { value: "21.01" } ] },
        { type: "Data", ColData: [ { value: "2026-06-03" }, { value: "Paycheque", id: "863" }, { value: "" }, { value: "-Split-", id: "" }, { value: "-1661.44" } ] },
      ] },
    };
    const e = parseExpenseReport(rep);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ accountId: "1150040016", source: "expense", amount: 21.01, txnId: "876", docNumber: "880281" });
  });
});

describe("decideCoding — the core brain rule", () => {
  it("no history -> FLAG no_history (never guess)", () => {
    const d = decideCoding([]);
    expect(d).toMatchObject({ status: "flag", flagReason: "no_history", suggestedAccountId: null });
  });

  it("one consistent account -> confident suggestion (real Walker history)", () => {
    const d = decideCoding(parseBillHistory(WALKER_BILLS));
    expect(d.status).toBe("suggested");
    expect(d.flagReason).toBeNull();
    expect(d.suggestedAccountId).toBe("1150040016");
    expect(d.suggestedTaxCode).toBe("6");
    expect(d.sampleCount).toBe(2);
  });

  it("two+ accounts -> ALWAYS FLAG with a ranked breakdown", () => {
    const entries = [
      { accountId: "A", accountName: "Repairs", taxCode: "6", source: "bill" as const, date: "2026-01-01", amount: 100, txnId: "1", docNumber: "1" },
      { accountId: "A", accountName: "Repairs", taxCode: "6", source: "bill" as const, date: "2026-02-01", amount: 100, txnId: "2", docNumber: "2" },
      { accountId: "B", accountName: "Fuel", taxCode: "6", source: "expense" as const, date: "2026-03-01", amount: 50, txnId: "3", docNumber: "3" },
    ];
    const d = decideCoding(entries);
    expect(d.status).toBe("flag");
    expect(d.flagReason).toBe("multiple_accounts");
    // ranked by frequency: Repairs (2) before Fuel (1); top suggestion is the leader
    expect(d.ranked.map((r) => r.accountId)).toEqual(["A", "B"]);
    expect(d.suggestedAccountId).toBe("A");
  });
});

describe("decideDedup — same lookup, two jobs", () => {
  const existing = [
    { docNumber: "17314", amount: 1184.03, date: "2026-05-12", txnId: "890" },
  ];
  it("invoice# match is a duplicate -> HOLD", () => {
    const v = decideDedup({ invoiceNumber: "17314", total: 1184.03, txnDate: "2026-05-12" }, existing);
    expect(v).toMatchObject({ isDuplicate: true, reason: "invoice_match", matchedTxnId: "890" });
  });
  it("amount+date within tolerance is a duplicate even w/o invoice#", () => {
    const v = decideDedup({ total: 1184.03, txnDate: "2026-05-13" }, existing);
    expect(v).toMatchObject({ isDuplicate: true, reason: "amount_date_match" });
  });
  it("different invoice + amount is NOT a duplicate", () => {
    const v = decideDedup({ invoiceNumber: "99999", total: 10.0, txnDate: "2026-05-12" }, existing);
    expect(v.isDuplicate).toBe(false);
  });
});
