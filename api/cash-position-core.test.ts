import { describe, it, expect } from "vitest";
import { assessCashPosition } from "./cash-position-core";

describe("cash-position-core", () => {
  it("healthy when cash covers payroll + buffer", () => {
    const p = assessCashPosition({ cashTotal: 50000, creditCardOwed: 3000, payrollNeed: 12000, minBuffer: 10000 });
    expect(p.status).toBe("ok");
    expect(p.enoughForPayroll).toBe(true);
    expect(p.afterPayroll).toBe(38000);
    expect(p.needsTransfer).toBe(false);
  });

  it("alerts when payroll can't be covered", () => {
    const p = assessCashPosition({ cashTotal: 8000, creditCardOwed: 0, payrollNeed: 12000, minBuffer: 5000 });
    expect(p.status).toBe("alert");
    expect(p.enoughForPayroll).toBe(false);
    expect(p.payrollShortfall).toBe(4000);
    expect(p.flags.some((f) => /short \$4,000/.test(f))).toBe(true);
  });

  it("flags a transfer-in when the post-payroll balance dips below the buffer", () => {
    const p = assessCashPosition({ cashTotal: 20000, creditCardOwed: 0, payrollNeed: 14000, minBuffer: 10000 });
    // afterPayroll = 6000 < buffer 10000 → needs ~4000 in
    expect(p.status).toBe("watch");
    expect(p.needsTransfer).toBe(true);
    expect(p.suggestedTransfer).toBe(4000);
  });

  it("watches a high credit-card balance vs cash", () => {
    const p = assessCashPosition({ cashTotal: 5000, creditCardOwed: 9000, payrollNeed: null, minBuffer: 0 });
    expect(p.ccHigh).toBe(true);
    expect(p.status).toBe("watch");
  });

  it("handles no-payroll clients (enoughForPayroll null)", () => {
    const p = assessCashPosition({ cashTotal: 30000, creditCardOwed: 2000, payrollNeed: null, minBuffer: 10000 });
    expect(p.enoughForPayroll).toBeNull();
    expect(p.afterPayroll).toBeNull();
    expect(p.status).toBe("ok");
  });

  it("alerts on a negative bank balance", () => {
    const p = assessCashPosition({ cashTotal: -500, creditCardOwed: 0, payrollNeed: null, minBuffer: 0 });
    expect(p.status).toBe("alert");
    expect(p.flags.some((f) => /negative/.test(f))).toBe(true);
  });
});
