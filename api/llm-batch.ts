/**
 * LLM BATCH RAIL — 50%-off async Claude calls for NON-interactive bulk work.
 * =============================================================================
 * Purpose:  The Anthropic Batch API runs many Messages requests asynchronously at a
 *           flat 50% discount (most batches finish < 1h, hard cap 24h). It is the
 *           right tool for Figgy's spiky OVERNIGHT work — classifying a whole client's
 *           backlog of unknown vendors in one shot — NOT the live chatbot (that can't
 *           wait). Prompt caching handles the live chatbot; this handles the sweeps.
 * Design:   `runBatch` is the generic rail (submit → poll → collect keyed by custom_id).
 *           `classifyVendorsBatch` is the first consumer; it reuses the SAME request
 *           body + parser as the live classifier (`qbo-vendor-web-classify`) so there's
 *           one source of truth for the prompt.
 * Safety:   Read-only classification — never posts. No key / no items → returns empty,
 *           never throws into a caller (degrade safely, like the live path).
 * Cost:     50% off every token vs the live path; combine with the standard model
 *           (Haiku) for the cheapest possible bulk classification.
 * =============================================================================
 */
import Anthropic from "@anthropic-ai/sdk";
import { vendorClassifyBody, parseVendorCategory, CLASSIFY_MODEL } from "./qbo-vendor-web-classify";
import type { VendorCategoryId } from "./qbo-vendor-classify";

export interface BatchRequest { customId: string; params: any }

/**
 * Submit a set of requests as ONE batch, poll until it ends, and return a map of
 * customId → the succeeded message (or null for errored/expired). Pure I/O around the
 * SDK; results arrive in ANY order, so we always key by customId, never by position.
 */
export async function runBatch(
  requests: BatchRequest[],
  opts?: { apiKey?: string; pollMs?: number; maxWaitMs?: number; onProgress?: (status: string, done: number, total: number) => void },
): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey || requests.length === 0) return out;

  const client = new Anthropic({ apiKey });
  const batch = await client.messages.batches.create({
    requests: requests.map((r) => ({ custom_id: r.customId, params: r.params })),
  } as any);

  const pollMs = opts?.pollMs ?? 15_000;
  const deadline = Date.now() + (opts?.maxWaitMs ?? 24 * 60 * 60 * 1000);
  // Poll until the batch has ended (or we hit the caller's wait budget).
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const cur = await client.messages.batches.retrieve(batch.id);
    const counts = (cur as any).request_counts || {};
    opts?.onProgress?.(cur.processing_status, (counts.succeeded || 0) + (counts.errored || 0), requests.length);
    if (cur.processing_status === "ended") break;
    if (Date.now() > deadline) return out; // timed out — caller falls back
    await new Promise((r) => setTimeout(r, pollMs));
  }

  for await (const result of await client.messages.batches.results(batch.id)) {
    out.set(result.custom_id, (result.result as any)?.type === "succeeded" ? (result.result as any).message : null);
  }
  return out;
}

/**
 * Classify many vendor names in one Batch job (50% off). Returns name → category hit
 * (only the recognized ones; unknowns are simply absent). Reuses the live classifier's
 * exact prompt + parser. Safe: no key / empty input → empty map, never throws.
 */
export async function classifyVendorsBatch(
  names: string[],
  opts?: { model?: string; maxWaitMs?: number; onProgress?: (status: string, done: number, total: number) => void },
): Promise<Map<string, { category: VendorCategoryId; label: string }>> {
  const result = new Map<string, { category: VendorCategoryId; label: string }>();
  const clean = [...new Set((names || []).map((n) => (n || "").trim()).filter(Boolean))];
  if (!clean.length || process.env.FIGGY_WEB_CLASSIFY === "off") return result;

  const model = opts?.model ?? CLASSIFY_MODEL();
  const reqs: BatchRequest[] = clean.map((name, i) => ({ customId: `v${i}`, params: vendorClassifyBody(name, model) }));
  const messages = await runBatch(reqs, { maxWaitMs: opts?.maxWaitMs, onProgress: opts?.onProgress });
  reqs.forEach((r, i) => {
    const msg = messages.get(r.customId);
    if (!msg) return;
    const hit = parseVendorCategory(msg.content ?? []);
    if (hit) result.set(clean[i], hit);
  });
  return result;
}
