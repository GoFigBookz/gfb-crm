import { describe, it, expect, afterEach } from "vitest";
import { buildBillPayload, validatePostable, billInputFromSourceData, isRealmPostEnabled, PILOT_REALMS, buildJournalEntryPayload, validateJournalEntry } from "./qbo-poster";

describe("buildBillPayload", () => {
  it("builds a valid QBO Bill with vendor, line account, tax code, date, doc#", () => {
    const p: any = buildBillPayload({
      vendorId: "42",
      txnDate: "2026-06-25",
      docNumber: "INV-1001",
      lines: [{ accountId: "1150040016", amount: 123.456, taxCodeId: "6", description: "Parts" }],
    });
    expect(p.VendorRef).toEqual({ value: "42" });
    expect(p.TxnDate).toBe("2026-06-25");
    expect(p.DocNumber).toBe("INV-1001");
    expect(p.Line[0].Amount).toBe(123.46); // rounded to cents
    expect(p.Line[0].DetailType).toBe("AccountBasedExpenseLineDetail");
    expect(p.Line[0].AccountBasedExpenseLineDetail.AccountRef).toEqual({ value: "1150040016" });
    expect(p.Line[0].AccountBasedExpenseLineDetail.TaxCodeRef).toEqual({ value: "6" });
  });

  it("omits TaxCodeRef when no tax code", () => {
    const p: any = buildBillPayload({ vendorId: "1", lines: [{ accountId: "5", amount: 10 }] });
    expect(p.Line[0].AccountBasedExpenseLineDetail.TaxCodeRef).toBeUndefined();
  });

  it("caps DocNumber at 21 chars (QBO limit)", () => {
    const p: any = buildBillPayload({ vendorId: "1", docNumber: "X".repeat(40), lines: [{ accountId: "5", amount: 10 }] });
    expect(String(p.DocNumber).length).toBe(21);
  });
});

describe("validatePostable", () => {
  it("passes a complete input", () => {
    expect(validatePostable({ vendorId: "1", lines: [{ accountId: "5", amount: 10 }] })).toEqual({ ok: true });
  });
  it("fails with no vendor", () => {
    const r = validatePostable({ lines: [{ accountId: "5", amount: 10 }] } as any);
    expect(r.ok).toBe(false);
  });
  it("fails with no lines", () => {
    expect(validatePostable({ vendorId: "1", lines: [] }).ok).toBe(false);
  });
  it("fails when a line has no account", () => {
    expect(validatePostable({ vendorId: "1", lines: [{ accountId: "", amount: 10 }] }).ok).toBe(false);
  });
  it("fails when a line amount is not > 0", () => {
    expect(validatePostable({ vendorId: "1", lines: [{ accountId: "5", amount: 0 }] }).ok).toBe(false);
  });
});

describe("billInputFromSourceData", () => {
  it("reads the single vendor/amount/account shape the brain writes", () => {
    const sd = JSON.stringify({ vendorId: "42", suggestedAccountId: "1150040016", subtotal: 100, suggestedTaxCode: "6", date: "2026-06-25", invoiceNumber: "A1", vendor: "Walker" });
    const inp = billInputFromSourceData(sd)!;
    expect(inp.vendorId).toBe("42");
    expect(inp.txnDate).toBe("2026-06-25");
    expect(inp.docNumber).toBe("A1");
    expect(inp.lines[0]).toMatchObject({ accountId: "1150040016", amount: 100, taxCodeId: "6" });
  });

  it("reads an explicit multi-line shape", () => {
    const sd = JSON.stringify({ vendorId: "7", lines: [{ accountId: "10", amount: 50, taxCode: "6" }, { accountId: "11", amount: 25 }] });
    const inp = billInputFromSourceData(sd)!;
    expect(inp.lines).toHaveLength(2);
    expect(inp.lines[1].accountId).toBe("11");
  });

  it("returns null when there's no resolved vendor (won't post a guess)", () => {
    expect(billInputFromSourceData(JSON.stringify({ vendor: "Walker", amount: 100 }))).toBeNull();
  });

  it("returns null on a non-postable finding", () => {
    expect(billInputFromSourceData(JSON.stringify({ title: "missing docs" }))).toBeNull();
    expect(billInputFromSourceData("not json")).toBeNull();
  });
});

describe("buildJournalEntryPayload + validateJournalEntry", () => {
  it("builds a balanced 2-line JE", () => {
    const inp = { txnDate: "2026-06-25", privateNote: "reclass", lines: [
      { accountId: "10", posting: "Debit" as const, amount: 100, description: "to expense" },
      { accountId: "20", posting: "Credit" as const, amount: 100 },
    ]};
    expect(validateJournalEntry(inp)).toEqual({ ok: true });
    const p: any = buildJournalEntryPayload(inp);
    expect(p.Line).toHaveLength(2);
    expect(p.Line[0].JournalEntryLineDetail.PostingType).toBe("Debit");
    expect(p.Line[0].JournalEntryLineDetail.AccountRef).toEqual({ value: "10" });
    expect(p.Line[1].JournalEntryLineDetail.PostingType).toBe("Credit");
    expect(p.TxnDate).toBe("2026-06-25");
  });

  it("rejects an unbalanced JE", () => {
    const r = validateJournalEntry({ lines: [
      { accountId: "10", posting: "Debit", amount: 100 },
      { accountId: "20", posting: "Credit", amount: 90 },
    ]});
    expect(r.ok).toBe(false);
  });

  it("rejects a single-line JE", () => {
    expect(validateJournalEntry({ lines: [{ accountId: "10", posting: "Debit", amount: 100 }] }).ok).toBe(false);
  });

  it("supports an intercompany JE with entity refs and 4 balanced lines", () => {
    const inp = { lines: [
      { accountId: "1", posting: "Debit" as const, amount: 50, entityId: "9", entityType: "Customer" as const },
      { accountId: "2", posting: "Credit" as const, amount: 50 },
      { accountId: "3", posting: "Debit" as const, amount: 25 },
      { accountId: "4", posting: "Credit" as const, amount: 25 },
    ]};
    expect(validateJournalEntry(inp).ok).toBe(true);
    const p: any = buildJournalEntryPayload(inp);
    expect(p.Line[0].JournalEntryLineDetail.Entity).toEqual({ Type: "Customer", EntityRef: { value: "9" } });
  });
});

describe("isRealmPostEnabled (firm-wide by default)", () => {
  const saved = process.env.FIGGY_POST_REALMS;
  afterEach(() => { if (saved === undefined) delete process.env.FIGGY_POST_REALMS; else process.env.FIGGY_POST_REALMS = saved; });

  it("allows ALL clients when FIGGY_POST_REALMS is unset", () => {
    delete process.env.FIGGY_POST_REALMS;
    expect(isRealmPostEnabled("9341456017349963")).toBe(true); // Clark OS
    expect(isRealmPostEnabled("123145963468664")).toBe(true);  // West York
  });
  it("restricts to the list when FIGGY_POST_REALMS is set", () => {
    process.env.FIGGY_POST_REALMS = "9341454721167426, 193514344934582";
    expect(isRealmPostEnabled("9341454721167426")).toBe(true);  // Alderson — listed
    expect(isRealmPostEnabled("9341456017349963")).toBe(false); // Clark OS — not listed
  });
  it("keeps the pilot set for reference", () => {
    expect(PILOT_REALMS.has("9341454721167426")).toBe(true);
  });
});
