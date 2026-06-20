/**
 * FIGGY JR — CLIENTS TABLE SCHEMA GUARD
 * =============================================================================
 * The live (Railway, persistent-volume) DB predates the current schema: the
 * `clients` table is MISSING columns the app now SELECTs (figgyEmail, contactName,
 * transactionsPerMonth, engagementSignedAt, province, qboConnectionId, …). Drizzle
 * selects an explicit column list, so a single missing column makes EVERY read of
 * the table throw — which is why the Clients page showed nothing even though rows
 * exist, and why the bridge + seed silently failed.
 *
 * This adds every expected column that's missing (PRAGMA-checked, nullable, safe,
 * idempotent — mirrors bridge-bootstrap / vendor-learning). It MUST run before
 * anything reads `clients`. Extra/legacy columns already on the table (e.g. an old
 * `notes`) are harmless — we only ADD, never drop.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

// Every column the current schema.ts `clients` table expects, with a SQLite type
// (+ default where the schema has one). Core cols (id/userId/name/email) always
// exist, so they're omitted.
const COLUMNS: Array<[string, string]> = [
  ["phone", "text"], ["company", "text"], ["address", "text"], ["taxId", "text"],
  ["status", "text DEFAULT 'active'"],
  ["clientType", "text DEFAULT 'monthly'"],
  ["workflowStatus", "text DEFAULT 'new_lead'"],
  ["leadSource", "text"], ["leadSourceDetail", "text"],
  ["discoveryDate", "integer"], ["nextAction", "text"], ["nextActionDate", "integer"],
  ["estimatedMonthlyValue", "real"], ["leadScore", "integer"],
  ["painPoints", "text"], ["expectations", "text"],
  ["serviceTier", "text DEFAULT 'standard'"], ["monthlyFee", "real DEFAULT 0"],
  ["onboardingSentAt", "integer"], ["onboardingCompletedAt", "integer"], ["onboardingToken", "text"],
  ["hasHST", "integer DEFAULT 0"], ["hstNumber", "text"], ["hstPeriod", "text"],
  ["hasWSIB", "integer DEFAULT 0"], ["wsibAccountNumber", "text"], ["wsibQuarter", "text"],
  ["hasPayroll", "integer DEFAULT 0"], ["payrollFrequency", "text"], ["payrollRemitterFreq", "text DEFAULT 'regular'"], ["yearEndMonth", "text"],
  ["payrollBonuses", "integer DEFAULT 0"], ["payrollDividends", "integer DEFAULT 0"], ["payrollPhoneAllowance", "integer DEFAULT 0"],
  ["payrollReimbursements", "integer DEFAULT 0"], ["payrollRevenueShare", "integer DEFAULT 0"], ["payrollCraComparison", "integer DEFAULT 0"],
  ["quoteAmount", "real"], ["quoteSentAt", "integer"], ["quoteApprovedAt", "integer"],
  ["transactionsPerMonth", "integer DEFAULT 0"],
  ["engagementSentAt", "integer"], ["engagementSignedAt", "integer"], ["engagementLetterUrl", "text"],
  ["assignedTo", "text"], ["oneDriveFolderId", "text"],
  ["payrollRpNumber", "text"], ["driveFolderUrl", "text"], ["clientInfoDocUrl", "text"], ["nextPayday", "text"],
  ["qboCustomerId", "text"], ["qboConnectionId", "integer"],
  ["industry", "text DEFAULT 'other'"], ["province", "text DEFAULT 'ON'"], ["qboAccountType", "text DEFAULT 'ca_clients'"],
  ["figgyEmail", "text"], ["contactName", "text"], ["craRacDone", "integer DEFAULT 0"],
  ["createdAt", "integer"], ["updatedAt", "integer"],
];

export async function ensureClientsColumns(): Promise<{ added: string[] }> {
  const db = getDb();
  const added: string[] = [];
  const have = new Set<string>();
  try {
    const res: any = await db.run(sql`PRAGMA table_info(clients)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
  } catch (e) {
    console.error("[schema] table_info(clients) failed:", e instanceof Error ? e.message : e);
    return { added };
  }
  for (const [col, type] of COLUMNS) {
    if (have.has(col)) continue;
    try {
      await db.run(sql.raw(`ALTER TABLE clients ADD COLUMN "${col}" ${type}`));
      added.push(col);
    } catch (e) {
      console.error("[schema] add clients column", col, "failed:", e instanceof Error ? e.message : e);
    }
  }
  if (added.length) console.log("[schema] clients: added missing columns:", added.join(", "));
  return { added };
}

/** Add the tasks.stage column (workflow board) if the live DB lacks it. */
export async function ensureTaskColumns(): Promise<void> {
  const db = getDb();
  const have = new Set<string>();
  try {
    const res: any = await db.run(sql`PRAGMA table_info(tasks)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
  } catch { return; }
  if (!have.has("stage")) {
    try { await db.run(sql.raw(`ALTER TABLE tasks ADD COLUMN "stage" text DEFAULT 'todo'`)); console.log("[schema] tasks: added stage"); }
    catch (e) { console.error("[schema] add tasks.stage failed:", e instanceof Error ? e.message : e); }
  }
}

/** Create the payroll tables (pay_runs, pay_run_lines) if the live DB lacks
 *  them. New tables aren't covered by the column-only migrations, and there's no
 *  drizzle push at runtime — so CREATE TABLE IF NOT EXISTS here. Idempotent. */
export async function ensurePayrollTables(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS pay_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER NOT NULL,
      payPeriodStart INTEGER NOT NULL,
      payPeriodEnd INTEGER NOT NULL,
      payDate INTEGER,
      frequency TEXT DEFAULT 'monthly',
      runType TEXT DEFAULT 'regular' NOT NULL,
      status TEXT DEFAULT 'draft' NOT NULL,
      hoursSource TEXT DEFAULT 'manual' NOT NULL,
      totalGross REAL DEFAULT 0,
      totalNet REAL DEFAULT 0,
      totalEmployeeDeductions REAL DEFAULT 0,
      totalEmployerCost REAL DEFAULT 0,
      approvalToken TEXT,
      approvalStatus TEXT DEFAULT 'none',
      approvedByName TEXT,
      approvedAt INTEGER,
      approvalNote TEXT,
      notes TEXT,
      createdAt INTEGER,
      updatedAt INTEGER
    )`));
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS pay_run_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payRunId INTEGER NOT NULL,
      employeeId INTEGER NOT NULL,
      regularHours REAL DEFAULT 0,
      overtimeHours REAL DEFAULT 0,
      vacationHours REAL DEFAULT 0,
      statHolidayHours REAL DEFAULT 0,
      sickHours REAL DEFAULT 0,
      grossPay REAL DEFAULT 0,
      shareBonus REAL DEFAULT 0,
      statHolidayPay REAL DEFAULT 0,
      vacationPayAccrued REAL DEFAULT 0,
      vacationPayPaid REAL DEFAULT 0,
      cppEmployee REAL DEFAULT 0,
      cpp2Employee REAL DEFAULT 0,
      eiEmployee REAL DEFAULT 0,
      federalTax REAL DEFAULT 0,
      provincialTax REAL DEFAULT 0,
      otherDeductions REAL DEFAULT 0,
      cppEmployer REAL DEFAULT 0,
      cpp2Employer REAL DEFAULT 0,
      eiEmployer REAL DEFAULT 0,
      netPay REAL DEFAULT 0,
      notes TEXT,
      createdAt INTEGER,
      updatedAt INTEGER
    )`));
    // employees predates this but may be missing on a fresh volume; create-if-absent.
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER NOT NULL,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      sin TEXT, dateOfBirth INTEGER, hireDate INTEGER, startDate INTEGER,
      payType TEXT DEFAULT 'salary', annualSalary REAL, hourlyRate REAL,
      hoursPerWeek REAL DEFAULT 40, position TEXT, department TEXT,
      email TEXT, phone TEXT, address TEXT,
      isContractor INTEGER DEFAULT 0, isActive INTEGER DEFAULT 1,
      terminationDate INTEGER, terminationReason TEXT,
      hasHealthBenefits INTEGER DEFAULT 0, hasDentalBenefits INTEGER DEFAULT 0,
      hasRrsp INTEGER DEFAULT 0, rrspMatchPercent REAL,
      onGovernmentGrant INTEGER DEFAULT 0, grantType TEXT, grantStartDate INTEGER, grantEndDate INTEGER,
      federalTaxCredits TEXT, provincialTaxCredits TEXT,
      t4Box14Wages REAL, t4Box16Cpp REAL, t4Box18Ei REAL, t4Box20Rpp REAL,
      t4Box44UnionDues REAL, t4Box46Charitable REAL, contractUrl TEXT,
      notes TEXT, createdAt INTEGER, updatedAt INTEGER
    )`));
    // ALTER guards for columns added after the tables first shipped on live.
    const addCol = async (table: string, col: string, type: string) => {
      try {
        const res: any = await db.run(sql.raw(`PRAGMA table_info(${table})`));
        const have = new Set<string>();
        for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
        if (!have.has(col)) await db.run(sql.raw(`ALTER TABLE ${table} ADD COLUMN "${col}" ${type}`));
      } catch (e) { console.error(`[schema] add ${table}.${col} failed:`, e instanceof Error ? e.message : e); }
    };
    await addCol("employees", "contractUrl", "TEXT");
    await addCol("employees", "phoneAllowance", "REAL");
    await addCol("employees", "reimbursementAmount", "REAL");
    await addCol("employees", "reimbursementNote", "TEXT");
    await addCol("employees", "getsRevenueShare", "INTEGER DEFAULT 0");
    await addCol("employees", "revenueSharePercent", "REAL");
    await addCol("employees", "getsBonus", "INTEGER DEFAULT 0");
    await addCol("employees", "getsDividends", "INTEGER DEFAULT 0");
    await addCol("employees", "getsPhoneAllowance", "INTEGER DEFAULT 0");
    await addCol("employees", "getsReimbursement", "INTEGER DEFAULT 0");
    await addCol("pay_run_lines", "shareBonus", "REAL DEFAULT 0");
    await addCol("pay_run_lines", "phoneAllowance", "REAL DEFAULT 0");
    await addCol("pay_run_lines", "reimbursement", "REAL DEFAULT 0");
    await addCol("pay_run_lines", "statHolidayPay", "REAL DEFAULT 0");
    await addCol("pay_runs", "approvalToken", "TEXT");
    await addCol("pay_runs", "approvalStatus", "TEXT DEFAULT 'none'");
    await addCol("pay_runs", "approvedByName", "TEXT");
    await addCol("pay_runs", "approvedAt", "INTEGER");
    await addCol("pay_runs", "approvalNote", "TEXT");
    console.log("[schema] payroll tables ensured");
  } catch (e) {
    console.error("[schema] ensurePayrollTables failed:", e instanceof Error ? e.message : e);
  }
}

/** Create the SMS messages table (texting clients via Android gateway). */
export async function ensureSmsTable(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS sms_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER,
      direction TEXT NOT NULL,
      counterparty TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT DEFAULT 'received' NOT NULL,
      externalId TEXT,
      read INTEGER DEFAULT 0,
      sentBy INTEGER,
      createdAt INTEGER
    )`));
    console.log("[schema] sms_messages table ensured");
  } catch (e) {
    console.error("[schema] ensureSmsTable failed:", e instanceof Error ? e.message : e);
  }
}

/** Create the client-requests tables (Karbon-style document checklists). */
export async function ensureClientRequestTables(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS client_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      token TEXT NOT NULL,
      status TEXT DEFAULT 'open' NOT NULL,
      dueDate INTEGER,
      reminderCount INTEGER DEFAULT 0,
      lastReminderAt INTEGER,
      createdBy INTEGER,
      completedAt INTEGER,
      createdAt INTEGER,
      updatedAt INTEGER
    )`));
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS client_request_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requestId INTEGER NOT NULL,
      label TEXT NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      response TEXT,
      providedAt INTEGER,
      sortOrder INTEGER DEFAULT 0,
      createdAt INTEGER
    )`));
    console.log("[schema] client-request tables ensured");
  } catch (e) {
    console.error("[schema] ensureClientRequestTables failed:", e instanceof Error ? e.message : e);
  }
}

/** Add newer client_onboarding columns the live DB may be missing (e.g.
 *  usesTouchBistro), so intake inserts don't fail. Idempotent. */
export async function ensureOnboardingColumns(): Promise<void> {
  const db = getDb();
  const have = new Set<string>();
  try {
    const res: any = await db.run(sql`PRAGMA table_info(client_onboarding)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
  } catch (e) {
    console.error("[schema] table_info(client_onboarding) failed:", e instanceof Error ? e.message : e);
    return;
  }
  const adds: Array<[string, string]> = [
    ["usesTouchBistro", "integer DEFAULT 0"],
    ["usesPayPal", "integer DEFAULT 0"],
    ["paysDividends", "integer DEFAULT 0"],
    ["hasEHT", "integer DEFAULT 0"],
    ["employeeCount", "integer DEFAULT 0"],
    ["monthsBehind", "integer DEFAULT 0"],
    ["bookkeepingFrequency", "text DEFAULT 'monthly'"],
    ["usesHubdoc", "integer DEFAULT 0"],
    ["hasJobCosting", "integer DEFAULT 0"],
    ["avgMonthlyTransactions", "integer DEFAULT 0"],
    ["invoicingResponsibility", "text DEFAULT 'none'"],
    ["billPayResponsibility", "text DEFAULT 'none'"],
    ["qboSoftwareTier", "text DEFAULT 'none'"],
    ["qboSoftwareWholesale", "integer DEFAULT 0"],
    ["qboPayrollWholesale", "integer DEFAULT 0"],
  ];
  for (const [col, type] of adds) {
    if (have.has(col)) continue;
    try { await db.run(sql.raw(`ALTER TABLE client_onboarding ADD COLUMN "${col}" ${type}`)); console.log("[schema] client_onboarding: added", col); }
    catch (e) { console.error("[schema] add client_onboarding column", col, "failed:", e instanceof Error ? e.message : e); }
  }
}
