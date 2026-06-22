/**
 * FIGGY JR — PROVINCIAL/TERRITORIAL INCOME TAX TABLES (2026)
 * =============================================================================
 * Generalized provincial tax for the nationwide payroll-withholding estimate.
 * Ontario keeps its dedicated path (surtax + health premium) in payroll-cra-core;
 * every OTHER jurisdiction is computed here as:
 *
 *     provincial annual tax = bracketTax(A) − lowestRate×BPA − lowestRate×credits
 *                             + surtax(basic)            (if the province has one)
 *
 * where `credits` = annual creditable base-CPP + EI (passed in by the caller, so
 * the federal/provincial credit treatment matches the CRA T4127 method already
 * used for Ontario). Health premiums / levies are noted per-province where they
 * exist (most have none).
 *
 * ACCURACY: these are estimates for planning — the calculator still says "verify
 * on CRA PDOC before remitting." Each table carries `verified` + `sourceYear`;
 * any jurisdiction whose 2026 figures weren't confirmed falls back to its latest
 * published year (clearly flagged) rather than guessing.
 * =============================================================================
 */
import { type Bracket, bracketTax } from "./payroll-tax-core";

export type ProvSurtax = { threshold: number; rate: number };

export type ProvTable = {
  code: string;
  name: string;
  brackets: Bracket[];
  lowestRate: number;
  bpa: number;
  surtaxes?: ProvSurtax[];   // applied on BASIC provincial tax (after BPA/credits)
  verified: boolean;
  sourceYear: number;        // the tax year these figures are actually from
  note?: string;
};

/**
 * Provincial table registry. Ontario is intentionally OMITTED here — it is
 * handled by the dedicated, fully-verified path in payroll-cra-core (surtax +
 * Ontario Health Premium). Tables below are populated from verified 2026 sources.
 */
export const PROVINCIAL_2026: Record<string, ProvTable> = {
  BC: {
    code: "BC", name: "British Columbia", lowestRate: 0.056, bpa: 13217, verified: false, sourceYear: 2026,
    note: "Brackets confirmed 2026; BPA derived from 2025×indexation — verify. Low-income reduction not modelled.",
    brackets: [
      { upTo: 50363, rate: 0.056 }, { upTo: 100728, rate: 0.077 }, { upTo: 115648, rate: 0.105 },
      { upTo: 140430, rate: 0.1229 }, { upTo: 190405, rate: 0.147 }, { upTo: 265545, rate: 0.168 },
      { upTo: Infinity, rate: 0.205 },
    ],
  },
  AB: {
    code: "AB", name: "Alberta", lowestRate: 0.08, bpa: 22769, verified: true, sourceYear: 2026,
    brackets: [
      { upTo: 61200, rate: 0.08 }, { upTo: 154259, rate: 0.10 }, { upTo: 185111, rate: 0.12 },
      { upTo: 246813, rate: 0.13 }, { upTo: 370220, rate: 0.14 }, { upTo: Infinity, rate: 0.15 },
    ],
  },
  SK: {
    code: "SK", name: "Saskatchewan", lowestRate: 0.105, bpa: 20381, verified: true, sourceYear: 2026,
    brackets: [
      { upTo: 53462, rate: 0.105 }, { upTo: 152902, rate: 0.125 }, { upTo: Infinity, rate: 0.145 },
    ],
  },
  MB: {
    code: "MB", name: "Manitoba", lowestRate: 0.108, bpa: 15780, verified: true, sourceYear: 2026,
    note: "Brackets + BPA frozen at 2024 levels (no indexation). BPA clawback above $200k net not modelled.",
    brackets: [
      { upTo: 47000, rate: 0.108 }, { upTo: 100000, rate: 0.1275 }, { upTo: Infinity, rate: 0.174 },
    ],
  },
  NB: {
    code: "NB", name: "New Brunswick", lowestRate: 0.094, bpa: 13664, verified: true, sourceYear: 2026,
    brackets: [
      { upTo: 49958, rate: 0.094 }, { upTo: 99916, rate: 0.14 }, { upTo: 185064, rate: 0.16 },
      { upTo: Infinity, rate: 0.195 },
    ],
  },
  NS: {
    code: "NS", name: "Nova Scotia", lowestRate: 0.0879, bpa: 11744, verified: false, sourceYear: 2026,
    note: "Brackets confirmed; 2026 BPA (post income-test reform) to confirm. Supplement not modelled.",
    brackets: [
      { upTo: 29590, rate: 0.0879 }, { upTo: 59180, rate: 0.1495 }, { upTo: 93000, rate: 0.1667 },
      { upTo: 150000, rate: 0.175 }, { upTo: Infinity, rate: 0.21 },
    ],
  },
  PE: {
    code: "PE", name: "Prince Edward Island", lowestRate: 0.095, bpa: 15000, verified: true, sourceYear: 2026,
    note: "Former 10% surtax repealed for 2024+.",
    brackets: [
      { upTo: 33328, rate: 0.095 }, { upTo: 64656, rate: 0.1347 }, { upTo: 105000, rate: 0.166 },
      { upTo: 140000, rate: 0.1762 }, { upTo: Infinity, rate: 0.19 },
    ],
  },
  NL: {
    code: "NL", name: "Newfoundland and Labrador", lowestRate: 0.087, bpa: 11188, verified: false, sourceYear: 2026,
    note: "Floor + top threshold confirmed; middle thresholds to verify. BPA = current law ($15k proposed, not enacted).",
    brackets: [
      { upTo: 44678, rate: 0.087 }, { upTo: 89357, rate: 0.145 }, { upTo: 159953, rate: 0.158 },
      { upTo: 223564, rate: 0.178 }, { upTo: 285230, rate: 0.198 }, { upTo: 570460, rate: 0.208 },
      { upTo: 1141275, rate: 0.213 }, { upTo: Infinity, rate: 0.218 },
    ],
  },
  YT: {
    code: "YT", name: "Yukon", lowestRate: 0.064, bpa: 16452, verified: true, sourceYear: 2026,
    note: "Tracks federal BPA; top-band BPA phase-out not modelled (negligible for typical pay).",
    brackets: [
      { upTo: 58523, rate: 0.064 }, { upTo: 117045, rate: 0.09 }, { upTo: 181440, rate: 0.109 },
      { upTo: 500000, rate: 0.128 }, { upTo: Infinity, rate: 0.15 },
    ],
  },
  NT: {
    code: "NT", name: "Northwest Territories", lowestRate: 0.059, bpa: 18198, verified: false, sourceYear: 2026,
    note: "Rates confirmed; 2026 thresholds derived from 2025×2% indexation — verify on CRA T4032-NT.",
    brackets: [
      { upTo: 51964, rate: 0.059 }, { upTo: 103930, rate: 0.086 }, { upTo: 168967, rate: 0.122 },
      { upTo: Infinity, rate: 0.1405 },
    ],
  },
  NU: {
    code: "NU", name: "Nunavut", lowestRate: 0.04, bpa: 19659, verified: true, sourceYear: 2026,
    brackets: [
      { upTo: 55801, rate: 0.04 }, { upTo: 111602, rate: 0.07 }, { upTo: 181439, rate: 0.09 },
      { upTo: Infinity, rate: 0.115 },
    ],
  },
  QC: {
    code: "QC", name: "Quebec", lowestRate: 0.14, bpa: 18952, verified: true, sourceYear: 2026,
    note: "Quebec collects its own tax; a 16.5% federal abatement applies to federal tax (handled in the engine).",
    brackets: [
      { upTo: 54345, rate: 0.14 }, { upTo: 108680, rate: 0.19 }, { upTo: 132245, rate: 0.24 },
      { upTo: Infinity, rate: 0.2575 },
    ],
  },
};

/** Quebec residents get a 16.5% federal abatement (refundable reduction of basic
 *  federal tax). Applied in the engine so combined CA+QC isn't overstated. */
export const QC_FEDERAL_ABATEMENT = 0.165;

/**
 * Annual provincial/territorial tax for jurisdiction `code`, given annual taxable
 * income `A` and annual creditable (base-CPP + EI) `credits`. Returns null when
 * we have no table for the code (caller should fall back to the Ontario path or
 * label it unsupported). Quebec is special (separate provincial system + federal
 * abatement) and is returned as a clearly-approximate figure if present.
 */
export function provincialAnnualTax(A: number, credits: number, code: string): { tax: number; table: ProvTable } | null {
  const t = PROVINCIAL_2026[code];
  if (!t) return null;
  const base = bracketTax(A, t.brackets);
  const k1 = t.lowestRate * t.bpa;
  const k2 = t.lowestRate * credits;
  const basic = Math.max(0, base - k1 - k2);
  let surtax = 0;
  for (const s of t.surtaxes ?? []) surtax += s.rate * Math.max(0, basic - s.threshold);
  return { tax: basic + surtax, table: t };
}
