import { describe, it, expect } from "vitest";
import { buildBillPayload, validatePostable, billInputFromSourceData, POST_ENABLED_REALMS } from "./qbo-poster";

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

describe("POST_ENABLED_REALMS", () => {
  it("includes Alderson, Ovita Construction, Ovita Holdings", () => {
    expect(POST_ENABLED_REALMS.has("9341454721167426")).toBe(true); // Alderson
    expect(POST_ENABLED_REALMS.has("193514344934582")).toBe(true);  // Ovita Construction
    expect(POST_ENABLED_REALMS.has("193514710535449")).toBe(true);  // Ovita Holdings
  });
  it("excludes a random realm", () => {
    expect(POST_ENABLED_REALMS.has("9341456017349963")).toBe(false); // Clark OS — not enabled
  });
});
