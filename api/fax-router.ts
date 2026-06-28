/**
 * FAX ROUTER — Send-a-Fax tool (CRA still requires faxes for many requests).
 * =============================================================================
 * Provider-agnostic seam; SRFax is the first (and default) backend — Canadian,
 * accountant-grade, keeps client tax documents on Canadian infrastructure.
 *
 * Config (server env): SRFAX_ACCESS_ID, SRFAX_ACCESS_PWD, SRFAX_CALLER_ID
 *   (your 10-digit SRFax fax number), SRFAX_SENDER_EMAIL (confirmations).
 *   With none set, `providerStatus` reports not-configured and the UI shows a
 *   "connect your fax line" card instead of a broken Send button.
 *
 * Inputs:  send({ toNumber, toName?, clientId?, fileName, base64, subject?, coverNote? }).
 * Outputs: { ok, reference, status }; history() returns the audit log.
 * Errors:  invalid number / missing config / provider error → a clear message,
 *          and a `failed` row is logged so nothing is silently lost.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { faxes, clients } from "../db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { isValidFaxNumber, normalizeFaxNumber, buildSrFaxQueueParams, parseSrFaxResponse } from "./fax-core";

const SRFAX_ENDPOINT = "https://www.srfax.com/SRF_SecWebSvc.php";

function srfaxConfig() {
  const accessId = process.env.SRFAX_ACCESS_ID || "";
  const accessPwd = process.env.SRFAX_ACCESS_PWD || "";
  const callerId = process.env.SRFAX_CALLER_ID || "";
  const senderEmail = process.env.SRFAX_SENDER_EMAIL || process.env.FIRM_EMAIL || "markie@gofig.ca";
  const configured = Boolean(accessId && accessPwd && callerId);
  return { accessId, accessPwd, callerId, senderEmail, configured };
}

export const faxRouter = createRouter({
  // Is a fax line wired up? (Never returns secrets — just whether it's ready.)
  providerStatus: authedQuery.query(async () => {
    const c = srfaxConfig();
    return {
      configured: c.configured,
      provider: "srfax" as const,
      callerId: c.configured ? c.callerId.replace(/\d(?=\d{4})/g, "•") : null, // masked
    };
  }),

  // Recent fax log (audit trail) for the signed-in user, with client names.
  history: authedQuery
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db.select().from(faxes)
        .where(eq(faxes.userId, ctx.user.id))
        .orderBy(desc(faxes.createdAt))
        .limit(input?.limit ?? 50);
      const ids = Array.from(new Set((rows as any[]).map((r) => r.clientId).filter(Boolean)));
      const names = new Map<number, string>();
      if (ids.length) {
        const cs = await db.select({ id: clients.id, name: clients.name }).from(clients).where(inArray(clients.id, ids as number[]));
        for (const c of cs as any[]) names.set(c.id, c.name);
      }
      return (rows as any[]).map((r) => ({ ...r, clientName: r.clientId ? names.get(r.clientId) || null : null }));
    }),

  // Send a fax. The file arrives as base64 (PDF or TIFF). Logs every attempt.
  send: authedQuery
    .input(z.object({
      toNumber: z.string().min(7),
      toName: z.string().max(200).optional(),
      clientId: z.number().optional(),
      fileName: z.string().min(1).max(200),
      base64: z.string().min(1),           // file content, no data: prefix
      pages: z.number().optional(),
      subject: z.string().max(200).optional(),
      coverNote: z.string().max(2000).optional(),
      includeCover: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const toNumber = normalizeFaxNumber(input.toNumber);

      // Helper to log an attempt (audit trail) regardless of outcome.
      const log = async (status: string, providerReference: string | null, errorMessage: string | null) => {
        const [row] = await db.insert(faxes).values({
          userId: ctx.user.id, clientId: input.clientId ?? null, toNumber,
          toName: input.toName ?? null, subject: input.subject ?? null,
          fileName: input.fileName, pages: input.pages ?? null, provider: "srfax",
          providerReference, status, errorMessage,
          sentAt: status === "queued" || status === "sent" ? new Date() : null,
        }).returning();
        return row;
      };

      if (!isValidFaxNumber(input.toNumber)) {
        await log("failed", null, "Invalid fax number");
        throw new Error("That doesn't look like a valid fax number (Canada/US). Check the digits and try again.");
      }

      const cfg = srfaxConfig();
      if (!cfg.configured) {
        await log("failed", null, "Fax provider not configured");
        throw new Error("No fax line connected yet. Add the SRFax credentials (SRFAX_ACCESS_ID / SRFAX_ACCESS_PWD / SRFAX_CALLER_ID) and this will send.");
      }

      // Strip a data: prefix if the browser left one.
      const content = input.base64.includes(",") ? input.base64.split(",").pop()! : input.base64;
      const params = buildSrFaxQueueParams(cfg, {
        toNumber, fileName: input.fileName, fileContentB64: content,
        coverPage: input.includeCover ? "Standard" : null,
        coverTo: input.toName ?? null, coverFrom: "Go Fig Bookz",
        subject: input.subject ?? null, comments: input.coverNote ?? null,
      });

      try {
        const body = new URLSearchParams(params).toString();
        const res = await fetch(SRFAX_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        const json: any = await res.json().catch(() => ({}));
        const parsed = parseSrFaxResponse(json);
        if (!parsed.ok) {
          const row = await log("failed", null, parsed.error || `HTTP ${res.status}`);
          return { ok: false as const, status: "failed", error: parsed.error, fax: row };
        }
        const row = await log("queued", parsed.reference ?? null, null);
        return { ok: true as const, status: "queued", reference: parsed.reference, fax: row };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const row = await log("failed", null, msg);
        return { ok: false as const, status: "failed", error: msg, fax: row };
      }
    }),
});
