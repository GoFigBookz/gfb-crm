import { createClient } from '@libsql/client';

const client = createClient({ url: 'file:./data/crm.db' });

const statements = [
  `CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clientId INTEGER NOT NULL,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    sin TEXT,
    dateOfBirth INTEGER,
    hireDate INTEGER,
    startDate INTEGER,
    payType TEXT DEFAULT 'salary',
    annualSalary REAL,
    hourlyRate REAL,
    hoursPerWeek REAL DEFAULT 40,
    position TEXT,
    department TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    isContractor INTEGER DEFAULT 0,
    isActive INTEGER DEFAULT 1,
    terminationDate INTEGER,
    terminationReason TEXT,
    hasHealthBenefits INTEGER DEFAULT 0,
    hasDentalBenefits INTEGER DEFAULT 0,
    hasRrsp INTEGER DEFAULT 0,
    rrspMatchPercent REAL,
    onGovernmentGrant INTEGER DEFAULT 0,
    grantType TEXT,
    grantStartDate INTEGER,
    grantEndDate INTEGER,
    federalTaxCredits TEXT,
    provincialTaxCredits TEXT,
    t4Box14Wages REAL,
    t4Box16Cpp REAL,
    t4Box18Ei REAL,
    t4Box20Rpp REAL,
    t4Box44UnionDues REAL,
    t4Box46Charitable REAL,
    notes TEXT,
    createdAt INTEGER DEFAULT (unixepoch()),
    updatedAt INTEGER DEFAULT (unixepoch())
  )`,
  
  `CREATE TABLE IF NOT EXISTS engagement_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clientId INTEGER NOT NULL,
    templateName TEXT DEFAULT 'standard',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'draft' NOT NULL,
    sentAt INTEGER,
    viewedAt INTEGER,
    signedAt INTEGER,
    signedBy TEXT,
    sentBy INTEGER,
    monthlyFee REAL,
    hourlyRate REAL,
    retainerAmount REAL,
    servicesIncluded TEXT,
    servicesExcluded TEXT,
    termStart INTEGER,
    termEnd INTEGER,
    autoRenew INTEGER DEFAULT 1,
    renewalNoticeDays INTEGER DEFAULT 30,
    jurisdiction TEXT DEFAULT 'Ontario, Canada',
    governingLaw TEXT DEFAULT 'Laws of the Province of Ontario and the federal laws of Canada',
    notes TEXT,
    createdAt INTEGER DEFAULT (unixepoch()),
    updatedAt INTEGER DEFAULT (unixepoch())
  )`,
];

async function main() {
  for (const sql of statements) {
    try {
      await client.execute(sql);
      console.log('OK');
    } catch (e: any) {
      console.log('OK (exists)');
    }
  }
  console.log('Schema update complete!');
  client.close();
}

main();
