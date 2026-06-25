/**
 * FIGS AT WORK — credential vault (Stage 2: she signs in herself).
 * =============================================================================
 * Figs needs her OWN logins for the sites she works (Hubdoc first, then each
 * client's portal) so every action is attributable to her, not Markie. Markie
 * pastes a login once; it's encrypted at rest with the SAME AES-256-GCM envelope
 * as the QBO tokens (FIGGY_TOKEN_KEY) and only ever decrypted server-side, at the
 * moment of sign-in. The browser never receives the password back.
 *
 * Self-contained + lazy: the table is created on first use (CREATE TABLE IF NOT
 * EXISTS), not at boot, so this module can't affect the rest of the app. Admin
 * only (gated at the route layer).
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./qbo-oauth";

let ensured = false;
async function ensureTable(): Promise<void> {
  if (ensured) return;
  const db = getDb();
  await db.run(
    sql.raw(`CREATE TABLE IF NOT EXISTS browser_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      label TEXT,
      clientId INTEGER,
      loginUrl TEXT,
      username TEXT,
      password TEXT,
      lastUsedAt INTEGER,
      createdAt INTEGER,
      updatedAt INTEGER
    )`),
  );
  ensured = true;
}

export type BrowserCredentialInput = {
  provider: string;       // "hubdoc" | "client_portal" | "other"
  label?: string | null;  // human label e.g. "Hubdoc — Figs"
  clientId?: number | null;
  loginUrl?: string | null;
  username: string;
  password: string;
};

/** Safe (no-secret) view of a stored credential for the UI. */
export type BrowserCredentialSafe = {
  id: number;
  provider: string;
  label: string | null;
  clientId: number | null;
  loginUrl: string | null;
  usernameMasked: string;
  hasPassword: boolean;
  lastUsedAt: number | null;
};

function maskUser(u: string | null): string {
  if (!u) return "";
  const [name, domain] = u.split("@");
  if (!domain) return u.length <= 2 ? u : u.slice(0, 2) + "•••";
  return `${name.slice(0, 2)}•••@${domain}`;
}

export async function listCredentials(): Promise<BrowserCredentialSafe[]> {
  await ensureTable();
  const rows = (await getDb().all(
    sql.raw(`SELECT id, provider, label, clientId, loginUrl, username, password, lastUsedAt FROM browser_credentials ORDER BY provider, id`),
  )) as any[];
  return rows.map((r) => ({
    id: Number(r.id),
    provider: String(r.provider),
    label: r.label ?? null,
    clientId: r.clientId != null ? Number(r.clientId) : null,
    loginUrl: r.loginUrl ?? null,
    usernameMasked: maskUser(decryptSecret(r.username)),
    hasPassword: !!r.password,
    lastUsedAt: r.lastUsedAt != null ? Number(r.lastUsedAt) : null,
  }));
}

export async function saveCredential(input: BrowserCredentialInput): Promise<{ id: number }> {
  await ensureTable();
  const db = getDb();
  const now = Date.now();
  const enc = {
    username: encryptSecret(input.username),
    password: encryptSecret(input.password),
  };
  const res = await db.run(
    sql`INSERT INTO browser_credentials (provider, label, clientId, loginUrl, username, password, createdAt, updatedAt)
        VALUES (${input.provider}, ${input.label ?? null}, ${input.clientId ?? null}, ${input.loginUrl ?? null}, ${enc.username}, ${enc.password}, ${now}, ${now})`,
  );
  return { id: Number((res as any)?.lastInsertRowid ?? 0) };
}

export async function deleteCredential(id: number): Promise<void> {
  await ensureTable();
  await getDb().run(sql`DELETE FROM browser_credentials WHERE id = ${id}`);
}

/** Decrypt one credential for the sign-in action. SERVER-ONLY — never expose. */
export async function getDecryptedCredential(
  id: number,
): Promise<{ provider: string; loginUrl: string | null; username: string; password: string } | null> {
  await ensureTable();
  const rows = (await getDb().all(
    sql.raw(`SELECT provider, loginUrl, username, password FROM browser_credentials WHERE id = ${Number(id)} LIMIT 1`),
  )) as any[];
  const r = rows[0];
  if (!r) return null;
  const username = decryptSecret(r.username) || "";
  const password = decryptSecret(r.password) || "";
  return { provider: String(r.provider), loginUrl: r.loginUrl ?? null, username, password };
}

export async function markCredentialUsed(id: number): Promise<void> {
  try { await getDb().run(sql`UPDATE browser_credentials SET lastUsedAt = ${Date.now()} WHERE id = ${id}`); } catch { /* non-fatal */ }
}
