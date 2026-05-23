-- Migration: Add all missing columns to clients table
-- Run this if schema.ts has columns that the actual DB is missing

ALTER TABLE clients ADD COLUMN leadSourceDetail text;
ALTER TABLE clients ADD COLUMN estimatedMonthlyValue real;
ALTER TABLE clients ADD COLUMN leadScore integer;
ALTER TABLE clients ADD COLUMN hasHST integer DEFAULT false;
ALTER TABLE clients ADD COLUMN hstNumber text;
ALTER TABLE clients ADD COLUMN hstPeriod text;
ALTER TABLE clients ADD COLUMN hasWSIB integer DEFAULT false;
ALTER TABLE clients ADD COLUMN wsibAccountNumber text;
ALTER TABLE clients ADD COLUMN wsibQuarter text;
ALTER TABLE clients ADD COLUMN hasPayroll integer DEFAULT false;
ALTER TABLE clients ADD COLUMN payrollFrequency text;
ALTER TABLE clients ADD COLUMN yearEndMonth text;
ALTER TABLE clients ADD COLUMN quoteAmount real;
ALTER TABLE clients ADD COLUMN quoteSentAt integer;
ALTER TABLE clients ADD COLUMN quoteApprovedAt integer;
ALTER TABLE clients ADD COLUMN transactionsPerMonth integer DEFAULT 0;
ALTER TABLE clients ADD COLUMN engagementSentAt integer;
ALTER TABLE clients ADD COLUMN engagementSignedAt integer;
ALTER TABLE clients ADD COLUMN engagementLetterUrl text;
