// AUTO-EXTRACTED from client payroll sheets. Source IDs in comments per client.
// Grounded entirely in the actual Google Sheets / Drive files; no invented people
// or rates. Where the sheet does not show a field, it is omitted (never guessed).
export type SeedEmployee = {
  firstName: string; lastName?: string;
  payType?: "salary" | "hourly" | "commission" | "contract";
  hourlyRate?: number; annualSalary?: number;
  position?: string; email?: string; notes?: string;
};
export type SeedClientRoster = { clientMatch: string; sourceFileId?: string; replace?: boolean; employees: SeedEmployee[] };

export const PAYROLL_EMPLOYEE_SEED: SeedClientRoster[] = [
  // ---------------------------------------------------------------------------
  // ORIGINALITY.AI INC. — current-month payroll tab.
  // Source: 1154Xi7Wk9qj9eg7O2j7jvIJff-982o1TBacefWY7YbE
  // Salaried staff (monthly salary shown), 3 hourly staff ($30/$30/$70), and the
  // revenue/commission-share group (G&A/Marketing/Product/R&D categories).
  // Salary figures are the per-period (monthly) salary shown on the sheet.
  // ---------------------------------------------------------------------------
  { clientMatch: "originality", sourceFileId: "1154Xi7Wk9qj9eg7O2j7jvIJff-982o1TBacefWY7YbE", employees: [
    { firstName: "Nathan", lastName: "Andrade Meira", payType: "salary", position: "Product - Engineering & Design", notes: "Monthly salary $6,833.33; start June 01" },
    { firstName: "Narcis", lastName: "Bejtic", payType: "salary", position: "G&A", notes: "Monthly salary $8,268.75; revenue-share line on sheet" },
    { firstName: "Arnav", lastName: "Bhagawati", payType: "salary", position: "Product - Engineering & Design", notes: "Monthly salary $6,562.50; start July 29" },
    { firstName: "Thomas", lastName: "Bongiorno", payType: "salary", position: "Head of Customer Success", notes: "Monthly salary $7,612.50; start Sept 3" },
    { firstName: "Sarah", lastName: "Empey", payType: "salary", position: "Marketing", notes: "Monthly salary $4,375.00 (sheet notes $4,166.67); also grant line at $27.03/hr Research Content Editor" },
    { firstName: "Michael", lastName: "Fraiman", payType: "hourly", hourlyRate: 30.00, notes: "Paid 15th & EOM; ~31-36 hrs/period" },
    { firstName: "Jon", lastName: "Gillham", payType: "salary", position: "G&A", notes: "Monthly salary $26,000.00; start June 01 (owner)" },
    { firstName: "Maddie", lastName: "Lambert-Taylor", payType: "salary", position: "Marketing", notes: "Monthly salary $7,333.33; revenue-share line on sheet" },
    { firstName: "Motiejus", lastName: "Lapp", payType: "salary", position: "G&A", notes: "Monthly salary $1,354.17; start June 01" },
    { firstName: "Kristin", lastName: "Laroque", payType: "salary", position: "Grant NRC", notes: "Monthly salary $3,416.67; start May 20" },
    { firstName: "Janay", lastName: "Ma", payType: "salary", position: "Product - Engineering & Design", notes: "Monthly salary $6,142.50; full time April 2024" },
    { firstName: "Joshua", lastName: "Moshood", payType: "salary", position: "Product - Engineering & Design", notes: "Monthly salary $7,000.00; now salary (hourly $83.34/hr from July 8)" },
    { firstName: "Liam", lastName: "Mc Nally", payType: "salary", position: "Product - Engineering & Design", notes: "Monthly salary $6,431.25; full time July 15; revenue-share line on sheet" },
    { firstName: "Urvish", lastName: "Patel", payType: "salary", position: "R&D", notes: "Monthly salary $396.07; last day May 4 2026 (start May 6 $4,166.67)" },
    { firstName: "Jessica", lastName: "Sawyer", payType: "hourly", hourlyRate: 30.00, position: "Marketing", notes: "Paid 15th & EOM; start June 23" },
    { firstName: "Ghazale", lastName: "Shafie", payType: "salary", position: "R&D", notes: "Monthly salary $7,500.00; start Oct 14; revenue-share line on sheet" },
    { firstName: "Trinh", lastName: "Tran", payType: "salary", position: "R&D", notes: "Monthly salary $9,528.75; start Oct 14; revenue-share line on sheet" },
    { firstName: "Connor", lastName: "Watt", payType: "salary", position: "Product - Engineering & Design", notes: "Monthly salary $7,525.00; advance payback $250/m; revenue-share line on sheet" },
    { firstName: "Kayla", lastName: "Zhu", payType: "hourly", hourlyRate: 70.00, position: "Marketing", notes: "Paid 15th & EOM; start June 23" },
  ] },

  // ---------------------------------------------------------------------------
  // SELECTIVE PAINTING — single monthly-salaried employee.
  // Source: 1sYhf5Jy4rW8rqZO61xMjuZFFMVodagQkKCKhm8928sE
  // Sheet shows monthly gross pay (Jan $2,971.96 / Feb $7,752.94 / Mar $11,629.41);
  // an annual salary or hourly rate is not stated, so neither is recorded.
  // ---------------------------------------------------------------------------
  { clientMatch: "selective", sourceFileId: "1sYhf5Jy4rW8rqZO61xMjuZFFMVodagQkKCKhm8928sE", employees: [
    { firstName: "Allesandro", lastName: "Le Marco", payType: "salary", notes: "Monthly payroll; gross pay varies by month (rate/annual salary not stated on sheet)" },
  ] },

  // ---------------------------------------------------------------------------
  // 2303851 ONTARIO INC. — PayrollSummaryByEmployee export
  // (01 Oct 2023 - 30 Sep 2024, all employees / all locations).
  // Source: 1d4ZYqlMVfIM6mwQDdcwA5kOKfhUfzSMo (.xls)
  // Report lists employees by name only; no per-employee rate/salary is broken
  // out as a usable field, so payType/rates are omitted.
  // ---------------------------------------------------------------------------
  { clientMatch: "2303851", sourceFileId: "1d4ZYqlMVfIM6mwQDdcwA5kOKfhUfzSMo", employees: [
    { firstName: "Stacey", lastName: "Gillham" },
    { firstName: "Ryan", lastName: "Gunn" },
    { firstName: "Melissa", lastName: "Robertson" },
    { firstName: "Kelley", lastName: "Van Boxmeer" },
    { firstName: "Ryan", lastName: "Watson" },
  ] },

  // ---------------------------------------------------------------------------
  // WEST YORK PAVING LTD. — from the most recent full paystub set
  // (pay date 12 Jun 2026). QBO autopay; rates included where the stub shows them.
  // Source: 1TkCX7FSfsO8UKaWDi24773SO-OQoIJhw (paystub PDF) in folder
  // 10FgSl5ctYkgxIaAa2-eTir7xOquQ7Xzj. Salaried staff show a per-period (weekly)
  // salary, not an annual figure, so it is captured in notes.
  // ---------------------------------------------------------------------------
  { clientMatch: "west york", sourceFileId: "1TkCX7FSfsO8UKaWDi24773SO-OQoIJhw", employees: [
    { firstName: "Calogero", lastName: "Barone", payType: "salary", notes: "Weekly salary $1,720.92" },
    { firstName: "Carmela", lastName: "Barone", payType: "salary", notes: "Weekly salary $675.00" },
    { firstName: "Dina", lastName: "Barone", payType: "salary", notes: "Weekly salary $1,186.92" },
    { firstName: "Frank", lastName: "Barone", payType: "salary", notes: "Weekly salary $1,250.00" },
    { firstName: "Giuseppe", lastName: "Barone", payType: "salary", notes: "Weekly salary $1,250.00" },
    { firstName: "Loredana", lastName: "Barone", payType: "salary", notes: "Weekly salary $675.00" },
    { firstName: "Gianpiero", lastName: "Cassaro", payType: "hourly", hourlyRate: 53.25 },
    { firstName: "Luis", lastName: "Chica", payType: "hourly", hourlyRate: 25.00 },
    { firstName: "Michelle", lastName: "Dinis", payType: "hourly", hourlyRate: 15.00 },
    { firstName: "Saif", lastName: "Naqwaj", payType: "hourly", hourlyRate: 27.50 },
    { firstName: "Carlos", lastName: "Pereira", payType: "hourly", hourlyRate: 35.00 },
    { firstName: "Miguel", lastName: "Perez", payType: "hourly", hourlyRate: 26.00 },
    { firstName: "Edwin", lastName: "Purizaca", payType: "hourly", hourlyRate: 26.00 },
    { firstName: "Jose", lastName: "Rolando", payType: "hourly", hourlyRate: 30.00 },
    { firstName: "Maria", lastName: "Sottile", payType: "salary", notes: "Weekly salary $700.00" },
    { firstName: "Remo", lastName: "Sottile", payType: "hourly", hourlyRate: 30.00, notes: "Garnishment on file" },
    { firstName: "Thomas", lastName: "Sottile", payType: "hourly", hourlyRate: 25.00 },
    { firstName: "Vittorio", lastName: "Sottile", payType: "hourly", hourlyRate: 41.25 },
  ] },

  // ---------------------------------------------------------------------------
  // CLARK POOLS AND SPAS — OWEN SOUND (Clark OS, realm 9341456017349963).
  // Source: 1BbnBDFhBFRA8CKs__jV-YNKIpKyfavkQ ("Clark Pools_ Employee Summary")
  // This roster lives in the Owen Sound entity's Due-Diligence tree
  // ("Finance - Clark Pools Owen Sound" → 1 - Company Documentation → Due
  // Diligence Items → 11 - Employee Information). Its 10 names have ZERO overlap
  // with the corrected Collingwood roster (below), confirming it is the Owen Sound
  // store roster (the combined "clark" seed has been split — replace:true
  // self-corrects it). Rates/positions are exactly as the Employee Summary shows.
  // VERIFIED 2026-06-20 against the live source (1BbnBDFhBFRA8CKs__jV-YNKIpKyfavkQ):
  // all 10 names/rates/positions still match the Employee Summary, so this entry is
  // kept as-is per the brief. NOTE (not applied — outside this fix's scope): the
  // current Owen Sound payroll run (CP-Owen Sound.xlsx, 1j8BWT81WZiB60IYh7eoCoU65n4RRLUY4,
  // run May 1 2026) has drifted from the Summary — it adds Adam Holt (salary $60k,
  // the dual-store person removed from Collingwood), Grace Dickinson, Bruce Funston,
  // Jamie Moseley, Alexis Montgomery, Neil Korchak, Ethan/Isabella Holt, and drops
  // some Summary names. Re-baseline this roster to the live run when OS is in scope.
  // ---------------------------------------------------------------------------
  { clientMatch: "owen sound", replace: true, sourceFileId: "1BbnBDFhBFRA8CKs__jV-YNKIpKyfavkQ", employees: [
    { firstName: "Cathy", lastName: "Bartley", payType: "hourly", hourlyRate: 19.00, position: "Store Clerk", notes: "Part time; start April 2025; vac 4%" },
    { firstName: "Dustin", lastName: "Bowlby", payType: "hourly", hourlyRate: 22.00, position: "Labourer", notes: "Full time seasonal; start Sept 2024; vac 4%" },
    { firstName: "Jammie", lastName: "Cook", payType: "hourly", hourlyRate: 31.00, position: "Technician", notes: "Full time/seasonal; start April 2024; vac 6%; winter hot-tub work as needed" },
    { firstName: "Dean", lastName: "Dickinson", payType: "hourly", hourlyRate: 31.00, position: "Labourer", notes: "Full time seasonal; start April 2010; vac 6%" },
    { firstName: "Michael", lastName: "Kennedy", payType: "hourly", hourlyRate: 24.00, position: "Labourer", notes: "Full time seasonal; start April 2022; vac 4%" },
    { firstName: "Debbie", lastName: "Martin", payType: "hourly", hourlyRate: 23.00, position: "Store Clerk/AR", notes: "Full time; start April 2008; vac 6%; plus commission on hot tubs ($500-1000/tub) and above-ground pools ($200-300)" },
    { firstName: "Brad", lastName: "Nickle", payType: "hourly", hourlyRate: 30.00, position: "Labourer", notes: "Full time seasonal; start April 2000; vac 6%" },
    { firstName: "Bradly", lastName: "Shaw", payType: "hourly", hourlyRate: 26.00, position: "Labourer", notes: "Full time seasonal; start April 2021; vac 4%" },
    { firstName: "Chris", lastName: "Prentice", payType: "salary", position: "Estimator/Project Manager", notes: "Biweekly salary $6,120.00; vac 8%" },
    { firstName: "Jennifer", lastName: "Prentice", payType: "salary", position: "AP/Bank Rec, Govt Remit/Acct", notes: "Biweekly salary $3,766.14; vac 8%" },
  ] },

  // ---------------------------------------------------------------------------
  // CLARK POOLS AND SPAS — COLLINGWOOD (Clark CW, realm 13633946244024404).
  // CORRECTED 2026-06-20: rebuilt from the CURRENT payroll register, replacing the
  // stale 2025 T4 (1xvr6OL_HU6hBgIK05x2bhzwJRLV6Ft7w), which listed names only,
  // included terminated/seasonal people paid sometime in 2025, and lumped in Owen
  // Sound staff (Adam Holt, etc.) whose mailing address showed Owen Sound.
  // Source: "CP-Collingwood Payroll & Cap Table" — most recent run Jun 12, 2026
  // (Sheet 1P-m-fBBbKT-L8VrcYG6Fd73DeskmUfrO6z7HWOlnR7k), cross-checked against the
  // Payroll Master "Rosters" tab (positions/rates). These 14 are the active roster
  // on the Jun-12-2026 run. Rates/positions/salaries are exactly as the run shows.
  // Dual-store resolution: Chris Hawton (chris@clarkpoolscollingwood.com) + Corey
  // Hawton both run on the CW payroll → kept in Collingwood (their 2025-T4 Owen
  // Sound mailing address is not their store). Adam Holt is on the CURRENT Owen
  // Sound payroll run + Rosters tab → he is Owen Sound, REMOVED from Collingwood.
  // Dropped from old seed (not on any current CW run): John Chapman, Ty Johnston,
  // Riki Reynolds — 2025 T4 only, no longer active.
  // replace:true so the prior combined "clark" / T4 seed self-corrects.
  // ---------------------------------------------------------------------------
  { clientMatch: "collingwood", replace: true, sourceFileId: "1P-m-fBBbKT-L8VrcYG6Fd73DeskmUfrO6z7HWOlnR7k", employees: [
    { firstName: "Chris", lastName: "Hawton", payType: "salary", position: "Manager/Salaried", email: "chris@clarkpoolscollingwood.com", notes: "Annual salary $60,000 (biweekly $2,330.77); 10% net-profit share paid quarterly; earned-equity per shareholder agreement; start Nov 15 2021. On 2025 T4 with Owen Sound mailing address but runs on the Collingwood payroll" },
    { firstName: "Brendan", lastName: "Essex", payType: "salary", position: "Salaried (33% owner)", email: "essexbrendan@gmail.com", notes: "Annual salary $80,000 on Jun 12 2026 run (was $60,000 earlier in 2026); 10% net-profit share quarterly; 33% ownership buy-in per cap table; start Sept 20 2022" },
    { firstName: "Chris", lastName: "Haight", payType: "hourly", hourlyRate: 27.00, position: "Senior Technician", notes: "Construction bonus pending; start Nov 15 2021" },
    { firstName: "Corey", lastName: "Hawton", payType: "hourly", hourlyRate: 26.50, position: "Senior Technician", notes: "On 2025 T4 with Owen Sound mailing address but on the current Collingwood payroll run" },
    { firstName: "Lisa", lastName: "Venditti", payType: "hourly", hourlyRate: 25.00, position: "Senior Technician", notes: "Start Nov 15 2021" },
    { firstName: "Adrian", lastName: "Robbeson", payType: "hourly", hourlyRate: 24.00, position: "Technician" },
    { firstName: "Chris", lastName: "Thompson", payType: "hourly", hourlyRate: 24.00, position: "Technician" },
    { firstName: "Dave", lastName: "Lally", payType: "hourly", hourlyRate: 24.00, position: "Technician" },
    { firstName: "Logan", lastName: "Greig", payType: "hourly", hourlyRate: 24.00, position: "Technician" },
    { firstName: "Justin", lastName: "Koutsomichos", payType: "hourly", hourlyRate: 23.00, position: "Technician" },
    { firstName: "Justin", lastName: "Pool", payType: "hourly", hourlyRate: 22.00, position: "Technician", notes: "Last day Jun 3 2026 (terminating)" },
    { firstName: "Aidan", lastName: "MacDonald", payType: "hourly", hourlyRate: 21.00, position: "Technician" },
    { firstName: "Matteo", lastName: "Companion", payType: "hourly", hourlyRate: 18.00, position: "Technician" },
    { firstName: "Alan", lastName: "Weaver", payType: "hourly", hourlyRate: 35.00, position: "Technician/Specialist", notes: "Start Nov 15 2021" },
  ] },

  // ---------------------------------------------------------------------------
  // 1001196626 ONTARIO LTD (SHER-E-PUNJAB) — TouchBistro restaurant payroll.
  // Source: 1BsiHTPaSnFhXZPwI_5YnLK32rdJhFOi6EWdCeujnPIo ("Sher-E-Punja Payroll"
  // Google Sheet; most recent pay date 6/12/2026, period May 27–Jun 9). The sheet
  // lists named employees with positions; corroborated by paystubs
  // (1OjsWUtNerJRVKe-VLGmIeeY-zSAC4Oun, "Sher-e-paystub 2024") and PD7A files.
  // The sheet's per-row hourly rates ($21/$17.60/$19/$18/$18/$17.60) cannot be
  // unambiguously aligned to each name from the flattened export, so rates are
  // captured in notes rather than hard-assigned (never guessed). The Chef row
  // carries a $70,000 annual salary line on the sheet.
  // ---------------------------------------------------------------------------
  { clientMatch: "sher", sourceFileId: "1BsiHTPaSnFhXZPwI_5YnLK32rdJhFOi6EWdCeujnPIo", employees: [
    { firstName: "Surya", lastName: "Bhattrai", position: "Chef", payType: "salary", notes: "Sheet shows $70,000 annual salary line for the Chef row" },
    { firstName: "Upendra", lastName: "Bahadur Poudel", position: "BOH", payType: "hourly", notes: "Hourly; rate per sheet rate column (approx $17.60-$21 range, exact alignment unconfirmed)" },
    { firstName: "Akash", lastName: "Dahal", position: "FOH", payType: "hourly", notes: "Hourly; sheet rate ~$19.00 (alignment unconfirmed)" },
    { firstName: "Rohit", lastName: "Dhimal", position: "BOH / Kitchen Manager", payType: "hourly", notes: "2024 paystub shows Kitchen Manager $25.00/hr; current sheet rate lower (~$18) — verify" },
    { firstName: "Dhiren", lastName: "Gurung", position: "BOH", payType: "hourly", notes: "Hourly; sheet rate ~$18.00 (alignment unconfirmed); recent periods 0 hrs" },
    { firstName: "Suraj", lastName: "Limbu", position: "BOH", payType: "hourly", notes: "Hourly; sheet rate ~$18.00 (alignment unconfirmed)" },
    { firstName: "Deepak", lastName: "Vasisth", position: "FOH", payType: "hourly", notes: "Hourly; sheet rate ~$17.60 (alignment unconfirmed); 'ROE?' note on sheet" },
  ] },

  // ---------------------------------------------------------------------------
  // FRACTAL SAAS INC. — single salaried employee, auto-paid in QuickBooks.
  // Per Markie: only one employee, Andrew, on salary, QBO autopay. (Surfaced for
  // visibility; no manual run needed.)
  // ---------------------------------------------------------------------------
  { clientMatch: "fractal", replace: true, employees: [
    { firstName: "Andrew", payType: "salary", notes: "QBO autopay; salaried (rate not stated)" },
  ] },
];
