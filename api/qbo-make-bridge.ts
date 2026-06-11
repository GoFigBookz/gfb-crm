/**
 * FIGGY JR — QBO MAKE BRIDGE (interim transport)
 * =============================================================================
 * Routes a QBO v3 request through a Make per-realm webhook proxy instead of our
 * own OAuth. This lets the Account Brain run live against a client's real books
 * NOW (Make already holds the authorized per-realm connection), while native
 * multi-tenant OAuth is built in parallel and cut over later.
 *
 * ISOLATION: the realmId is baked into the connection row and sent on every
 * call; the Make proxy performs the QBO call for THAT realm only. A Clark OS
 * connection can never return Clark CW data — same guarantee as native.
 *
 * CONTRACT with the Make proxy scenario (mirrors the per-realm QBO tools, e.g.
 * scenario 5347484 "figgy_qbo_api_clark_os"): it receives JSON
 *   { realmId, url, method, qs_query, body }
 * where `url` is relative to v3/company/<realm>/ (e.g. "/query", "/reports/...",
 * "/vendor"), performs the authorized call, and returns the QBO JSON — either
 * raw, or wrapped as { tool_output: { body } } / { body }. We normalize all three.
 * Auth: HMAC-SHA256 over the raw JSON body in the X-Figgy-Signature header.
 * =============================================================================
 */
import crypto from "crypto";

export type MakeBridgeConfig = { bridgeUrl: string; bridgeSecret: string; realmId: string };

/** Split an endpoint the brain built (e.g. "/query?query=SELECT..%20") into the
 *  url + qs_query the Make per-realm tool expects. The brain encodes SQL as
 *  `?query=<urlencoded>`; the Make tool wants the raw SQL in `qs_query`. */
export function toMakeRequest(endpoint: string): { url: string; qs_query: string } {
  const qIdx = endpoint.indexOf("?");
  const url = qIdx >= 0 ? endpoint.slice(0, qIdx) : endpoint;
  let qs_query = qIdx >= 0 ? endpoint.slice(qIdx + 1) : "";
  if (qs_query.startsWith("query=")) qs_query = decodeURIComponent(qs_query.slice("query=".length));
  return { url, qs_query };
}

/** Normalize the proxy's response to the bare QBO body (handles raw / tool_output / body). */
export function unwrapBridgeResponse(data: any): any {
  return data?.tool_output?.body ?? data?.body ?? data;
}

export async function qboRequestViaMake(
  cfg: MakeBridgeConfig,
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown,
): Promise<any> {
  if (!cfg.bridgeUrl) throw new Error("Make bridge not configured: missing bridgeUrl");
  const { url, qs_query } = toMakeRequest(endpoint);
  const payload = JSON.stringify({ realmId: cfg.realmId, url, method, qs_query, body: body ?? null });
  const sig = crypto.createHmac("sha256", cfg.bridgeSecret || "").update(payload).digest("base64");
  const res = await fetch(cfg.bridgeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Figgy-Signature": sig },
    body: payload,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Make bridge ${method} ${url} failed: ${res.status} ${errText}`);
  }
  return unwrapBridgeResponse(await res.json());
}
