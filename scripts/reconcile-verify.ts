/**
 * Standalone verification of the reconciliation core, runnable with Node's
 * type-stripping (no test runner):  node --experimental-strip-types scripts/reconcile-verify.ts
 * Uses REAL West York Paving BMO MasterCard Dec-2025 statement data.
 */
import assert from "node:assert/strict";
import {
  parseBmoCsv,
  toIso,
  normalizeMerchant,
  merchantSimilarity,
  reconcileMonth,
  type RegisterLine,
} from "../api/reconcile-core.ts";

let pass = 0;
const check = (name: string, fn: () => void) => { fn(); pass++; console.log("  ✓", name); };

// --- REAL Dec-2025 BMO statement export, card ·4686 (Date,Description,Amount) ---
const BMO_4686_DEC2025 = `Date,Description,Amount
11/28/2025,Uber Holdings Canada Toronto ON,-22.68
12/3/2025,UNITED LBR HM HWR #1325 BOLTON ON,-340.34
12/3/2025,PAYMENT RECEIVED - THANK YOU,10000
12/8/2025,PAYMENT RECEIVED - THANK YOU,10000
12/9/2025,PRINCESS AUTO 12 MISSISSAUGA ON,-927.17
12/12/2025,PRINCESS AUTO 40 BOLTON ON,438.43
12/26/2025,INTEREST PURCHASES,-601.62`;

check("parseBmoCsv flips sign into owed convention (M/D/YYYY)", () => {
  const rows = parseBmoCsv(BMO_4686_DEC2025, "4686");
  assert.equal(rows.length, 7);
  // A purchase (-340.34 on the CSV) becomes +34034 cents owed.
  const united = rows.find((r) => r.description.includes("UNITED LBR"))!;
  assert.equal(united.chargeCents, 34034);
  assert.equal(united.date, "2025-12-03");
  assert.equal(united.card, "4686");
  // A payment (+10000 on the CSV) becomes -1,000,000 cents owed.
  const pay = rows.find((r) => r.description.includes("PAYMENT RECEIVED"))!;
  assert.equal(pay.chargeCents, -1000000);
});

check("toIso handles both BMO date formats", () => {
  assert.equal(toIso("12/3/2025"), "2025-12-03");
  assert.equal(toIso("2025-11-27"), "2025-11-27");
  assert.equal(toIso("garbage"), "");
});

check("normalizeMerchant strips store #s, province, punctuation", () => {
  assert.equal(normalizeMerchant("TIM HORTONS #1567 NOBLETON ON"), "TIM HORTONS NOBLETON");
  assert.ok(merchantSimilarity("PRINCESS AUTO 12 MISSISSAUGA ON", "Princess Auto") > 0.4);
});

check("reconcileMonth ties when QBO register mirrors the statement", () => {
  const stmt = parseBmoCsv(BMO_4686_DEC2025, "4686");
  // Build a QBO register that contains every statement line (same owed-cents),
  // dates within a couple days, payee text slightly different (real-world).
  const register: RegisterLine[] = stmt.map((s, i) => ({
    id: `Q${i}`,
    date: s.date,
    description: s.description.replace(/#\d+/, "").toLowerCase(),
    chargeCents: s.chargeCents,
    type: s.chargeCents < 0 ? "Payment" : "Purchase",
  }));
  const net = stmt.reduce((a, s) => a + s.chargeCents, 0);
  const opening = 3_172_851; // $31,728.51 prior balance
  const res = reconcileMonth({
    periodStart: "2025-11-29", periodEnd: "2025-12-28",
    openingBalanceCents: opening,
    statementEndingBalanceCents: opening + net,
    statementLines: stmt, registerLines: register,
  });
  assert.equal(res.matched.length, 7);
  assert.equal(res.missingInQbo.length, 0);
  assert.equal(res.extraInQbo.length, 0);
  assert.equal(res.totals.differenceCents, 0);
  assert.equal(res.ties, true);
});

check("reconcileMonth surfaces a charge missing from QBO (gated-entry candidate)", () => {
  const stmt = parseBmoCsv(BMO_4686_DEC2025, "4686");
  // QBO is missing the $927.17 Princess Auto charge.
  const register: RegisterLine[] = stmt
    .filter((s) => !s.description.includes("PRINCESS AUTO 12"))
    .map((s, i) => ({ id: `Q${i}`, date: s.date, description: s.description, chargeCents: s.chargeCents }));
  const net = stmt.reduce((a, s) => a + s.chargeCents, 0);
  const opening = 3_172_851;
  const res = reconcileMonth({
    periodStart: "2025-11-29", periodEnd: "2025-12-28",
    openingBalanceCents: opening, statementEndingBalanceCents: opening + net,
    statementLines: stmt, registerLines: register,
  });
  assert.equal(res.missingInQbo.length, 1);
  assert.equal(res.missingInQbo[0].chargeCents, 92717);
  // Difference equals exactly the un-entered charge → confirms it's the cause.
  assert.equal(res.totals.differenceCents, 92717);
  assert.equal(res.ties, false);
});

check("reconcileMonth flags a QBO txn not on the statement (extra/wrong period)", () => {
  const stmt = parseBmoCsv(BMO_4686_DEC2025, "4686");
  const register: RegisterLine[] = stmt.map((s, i) => ({
    id: `Q${i}`, date: s.date, description: s.description, chargeCents: s.chargeCents,
  }));
  register.push({ id: "QX", date: "2025-12-27", description: "STALE CHARGE NEXT PERIOD", chargeCents: 5000 });
  const net = stmt.reduce((a, s) => a + s.chargeCents, 0);
  const opening = 3_172_851;
  const res = reconcileMonth({
    periodStart: "2025-11-29", periodEnd: "2025-12-28",
    openingBalanceCents: opening, statementEndingBalanceCents: opening + net,
    statementLines: stmt, registerLines: register,
  });
  assert.equal(res.extraInQbo.length, 1);
  assert.equal(res.extraInQbo[0].id, "QX");
  assert.equal(res.ties, false);
});

check("statementSelfCheck catches a wrong opening balance", () => {
  const stmt = parseBmoCsv(BMO_4686_DEC2025, "4686");
  const net = stmt.reduce((a, s) => a + s.chargeCents, 0);
  const res = reconcileMonth({
    periodStart: "2025-11-29", periodEnd: "2025-12-28",
    openingBalanceCents: 0, // wrong on purpose
    statementEndingBalanceCents: 3_172_851 + net,
    statementLines: stmt,
    registerLines: stmt.map((s, i) => ({ id: `Q${i}`, date: s.date, description: s.description, chargeCents: s.chargeCents })),
  });
  // Opening is off by $31,728.51 → self-check exposes it regardless of matching.
  assert.equal(res.totals.statementSelfCheckCents, 3_172_851);
});

check("duplicate same-amount charges each match a distinct QBO txn", () => {
  const stmt = parseBmoCsv(
    `Date,Description,Amount
12/14/2025,EXPEDIA 72067977380726,-1118.25
12/14/2025,EXPEDIA 72067977380726,-1118.25`, "4686");
  const register: RegisterLine[] = [
    { id: "A", date: "2025-12-14", description: "EXPEDIA", chargeCents: 111825 },
    { id: "B", date: "2025-12-15", description: "EXPEDIA", chargeCents: 111825 },
  ];
  const res = reconcileMonth({
    periodStart: "2025-12-01", periodEnd: "2025-12-28",
    openingBalanceCents: 0, statementEndingBalanceCents: 223650,
    statementLines: stmt, registerLines: register,
  });
  assert.equal(res.matched.length, 2);
  assert.notEqual(res.matched[0].register.id, res.matched[1].register.id);
});

console.log(`\nreconcile-core: ${pass}/${pass} checks green`);
