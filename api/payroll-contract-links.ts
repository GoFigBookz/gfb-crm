// AUTO-EXTRACTED employee contract links from Drive. Real file IDs only.
// Only entries that match a CURRENT payroll-roster employee are kept here — the
// Drive search surfaced many historical (ContentRefined / old Clark) agreements
// that don't map to anyone currently on payroll, so those are intentionally
// omitted. Paste any others directly on the employee card.
export type ContractLink = { clientMatch: string; firstName: string; lastName?: string; contractUrl: string };

export const PAYROLL_CONTRACT_LINKS: ContractLink[] = [
  // Fractal's Andrew = Andrew Rains; his only agreement on Drive is the
  // 2303851/Realiant one (confirmed via Fractal's RBC payroll reconciliation).
  { clientMatch: "fractal", firstName: "Andrew", contractUrl: "https://drive.google.com/file/d/19AJTqyMX2hCGq409Oj7yPTKTUFW8cj3G/view" },
  // Narcis Bejtic (now Originality) — his 2020 employment agreement on file.
  { clientMatch: "originality", firstName: "Narcis", lastName: "Bejtic", contractUrl: "https://drive.google.com/file/d/1e14Dl23CbCT0VhDVdS1tFCBm2-3ggEoK/view" },
];
