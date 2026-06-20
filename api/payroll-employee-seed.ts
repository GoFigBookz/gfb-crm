// AUTO-EXTRACTED from client payroll sheets. Source IDs in comments per client.
// Grounded entirely in the actual Google Sheets / Drive files; no invented people
// or rates. Where the sheet does not show a field, it is omitted (never guessed).
export type SeedEmployee = {
  firstName: string; lastName?: string;
  payType?: "salary" | "hourly" | "commission" | "contract";
  hourlyRate?: number; annualSalary?: number;
  position?: string; email?: string; notes?: string;
};
export type SeedClientRoster = { clientMatch: string; sourceFileId?: string; employees: SeedEmployee[] };

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
  // CLARK POOLS AND SPAS — Employee Summary (single combined roster found in
  // Due Diligence; the sheet does not split Owen Sound vs Collingwood, so this
  // is recorded under a generic "clark" match. NOTE: Clark OS and Clark CW are
  // permanently separate entities — confirm which store each employee belongs to
  // before splitting; do not assume.
  // Source: 1BbnBDFhBFRA8CKs__jV-YNKIpKyfavkQ (Clark Pools_ Employee Summary)
  // ---------------------------------------------------------------------------
  { clientMatch: "clark", sourceFileId: "1BbnBDFhBFRA8CKs__jV-YNKIpKyfavkQ", employees: [
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
];
