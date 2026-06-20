import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { smsMessages, clients } from "../db/schema";
import { eq, desc, and } from "drizzle-orm";

/** Keep last 10 digits so "+1 (416) 555-1212" and "4165551212" match. */
export function normalizePhone(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

async function matchClientByPhone(phone: string): Promise<{ id: number; name: string } | null> {
  const db = getDb();
  const norm = normalizePhone(phone);
  if (!norm) return null;
  const all = await db.select().from(clients);
  const hit = (all as any[]).find((c) => normalizePhone(c.phone || "") === norm);
  return hit ? { id: hit.id, name: hit.name } : null;
}

/** Store an inbound SMS (called by the /api/sms/inbound webhook). */
export async function ingestInboundSms(from: string, body: string, externalId: string | null) {
  const db = getDb();
  const counterparty = normalizePhone(from);
  const client = await matchClientByPhone(from);
  const [row] = await db.insert(smsMessages).values({
    clientId: client?.id ?? null,
    direction: "inbound",
    counterparty,
    body,
    status: "received",
    externalId: externalId ? String(externalId) : null,
    read: false,
  }).returning();
  return row;
}

/** Send an outbound SMS via the Android gateway's API (if configured). */
async function gatewaySend(toDigits: string, body: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const url = process.env.SMS_GATEWAY_URL;          // e.g. https://api.sms-gate.app/3rdparty/v1/message
  const user = process.env.SMS_GATEWAY_USER;
  const pass = process.env.SMS_GATEWAY_PASS;
  if (!url || !user || !pass) return { ok: false, error: "SMS gateway not configured" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64") },
      body: JSON.stringify({ message: body, phoneNumbers: [toDigits] }),
    });
    if (!res.ok) return { ok: false, error: `gateway ${res.status}` };
    const j: any = await res.json().catch(() => ({}));
    return { ok: true, id: j?.id ?? j?.messageId ?? undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

export const messageRouter = createRouter({
  // Conversation list: one entry per counterparty, latest message + unread count.
  threads: staffQuery.query(async () => {
    const db = getDb();
    const rows = await db.select().from(smsMessages).orderBy(desc(smsMessages.createdAt));
    const cs = await db.select().from(clients);
    const nameById = new Map((cs as any[]).map((c) => [c.id, c.name]));
    const byParty = new Map<string, any>();
    for (const m of rows as any[]) {
      let t = byParty.get(m.counterparty);
      if (!t) { t = { counterparty: m.counterparty, clientId: m.clientId, clientName: m.clientId ? nameById.get(m.clientId) : null, last: m, unread: 0 }; byParty.set(m.counterparty, t); }
      if (m.direction === "inbound" && !m.read) t.unread++;
      if (m.clientId && !t.clientId) { t.clientId = m.clientId; t.clientName = nameById.get(m.clientId); }
    }
    return Array.from(byParty.values());
  }),

  unreadCount: staffQuery.query(async () => {
    const db = getDb();
    const rows = await db.select().from(smsMessages).where(and(eq(smsMessages.direction, "inbound"), eq(smsMessages.read, false)));
    return rows.length;
  }),

  thread: staffQuery
    .input(z.object({ counterparty: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const cp = normalizePhone(input.counterparty);
      return db.select().from(smsMessages).where(eq(smsMessages.counterparty, cp)).orderBy(smsMessages.createdAt);
    }),

  markRead: staffQuery
    .input(z.object({ counterparty: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(smsMessages).set({ read: true }).where(and(eq(smsMessages.counterparty, normalizePhone(input.counterparty)), eq(smsMessages.direction, "inbound")));
      return { success: true };
    }),

  send: staffQuery
    .input(z.object({ counterparty: z.string().min(7), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const cp = normalizePhone(input.counterparty);
      const client = await matchClientByPhone(input.counterparty);
      const sent = await gatewaySend(cp, input.body);
      const [row] = await db.insert(smsMessages).values({
        clientId: client?.id ?? null,
        direction: "outbound",
        counterparty: cp,
        body: input.body,
        status: sent.ok ? "sent" : "failed",
        externalId: sent.id ?? null,
        read: true,
        sentBy: ctx.user.id,
      }).returning();
      return { success: sent.ok, error: sent.error, message: row };
    }),

  // Whether outbound sending is wired up yet (UI hint).
  gatewayStatus: staffQuery.query(() => ({ configured: !!(process.env.SMS_GATEWAY_URL && process.env.SMS_GATEWAY_USER && process.env.SMS_GATEWAY_PASS) })),
});
