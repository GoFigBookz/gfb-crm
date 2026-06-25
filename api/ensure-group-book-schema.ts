/**
 * GROUP CONTROL BOOK — schema guard.
 * Creates the group_* tables that recreate a multi-company owner's control book
 * (entities / cap table / dividend-profit / family benefit). CREATE TABLE IF NOT
 * EXISTS — idempotent, runs at boot before anything reads them.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureGroupBookTables(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS group_entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      groupName TEXT NOT NULL,
      companyName TEXT NOT NULL,
      clientId INTEGER,
      operatingName TEXT,
      incorporationNumber TEXT,
      businessNumber TEXT,
      yearEnd TEXT,
      address TEXT,
      statusNote TEXT,
      sortOrder INTEGER DEFAULT 0,
      createdAt INTEGER
    )`));
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS group_ownership (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      groupName TEXT NOT NULL,
      companyName TEXT NOT NULL,
      holderName TEXT NOT NULL,
      holderType TEXT DEFAULT 'individual',
      shares TEXT,
      shareClass TEXT,
      ownershipPct REAL,
      note TEXT
    )`));
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS group_profit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      groupName TEXT NOT NULL,
      companyName TEXT NOT NULL,
      fiscalYear TEXT NOT NULL,
      ownershipPct REAL,
      ytdProfit REAL,
      taxLiability REAL
    )`));
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS group_family_benefit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      groupName TEXT NOT NULL,
      personName TEXT NOT NULL,
      baseSalary REAL,
      allocation TEXT,
      comment TEXT
    )`));
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS group_book_share_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      groupName TEXT NOT NULL,
      token TEXT NOT NULL,
      label TEXT,
      active INTEGER DEFAULT 1 NOT NULL,
      createdBy INTEGER,
      createdAt INTEGER,
      revokedAt INTEGER
    )`));
  } catch (e) {
    console.error("[schema] ensureGroupBookTables failed:", e instanceof Error ? e.message : e);
  }
}
