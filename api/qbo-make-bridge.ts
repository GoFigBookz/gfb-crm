/**
 * FIGGY JR — QBO MAKE BRIDGE (interim transport)
 * =============================================================================
 * Routes a QBO v3 request through Make instead of our own OAuth, so the Account
 * Brain can run live against a client's REAL books NOW (Make already holds the
 * authorized per-realm connection), while native multi-tenant OAuth is built in
 * parallel and cut over later.
 *
 * MECHANISM: calls Make's scenario-run API (responsive) against the existing,
 * already-proven per-realm "FIGGY QBO API" tool scenario (e.g. Clark OS = 5347484,
 * Clark CW = 5347489). That scenario is an on-demand subscenario:
 *   input { url, method, body, qs_query } -> quickbooks:MakeApiCall (that realm's
 *   connection) -> ReturnData { tool_output }.  Verified live 2026-06-11.
 *
 * ISOLATION: one scenario per realm, each bound at design-time to exactly one
 * QBO connection. A Clark OS run can never touch Clark CW's books — same
 * guarantee as native. `bridgeUrl` is that realm's run endpoint; the client→realm
 * →scenario mapping lives in the qbo_connections row.
 *
 * Response shape (responsive run):
 *   { executionId, outputs: { tool_output: { body, headers } }, status }
 * We return `outputs.tool_output.body` — the bare QBO JSON the brain expects.
 * =============================================================================
 */
export type MakeBridgeConfig = { bridgeUrl: string; apiToken: string; realmId: string };

/** Split an endpoint the brain built into the url + qs_query the per-realm
 *  scenario expects.
 *  - "/query?query=<urlencoded SQL>"  -> the scenario maps a SINGLE `query` qs
 *    param, so the raw SQL goes in `qs_query`.
 *  - everything else (e.g. "/reports/TransactionList?vendor=..&start_date=..&
 *    end_date=..&columns=..") has MULTIPLE params the scenario can't map one by
 *    one, so we keep the whole querystring in `url` (the scenario's empty `query`
 *    qs is harmless — QBO ignores it). Verified live 2026-06-11. */
export function toMakeRequest(endpoint: string): { url: string; qs_query: string } {
  const qIdx = endpoint.indexOf("?");
  if (qIdx < 0) return { url: endpoint, qs_query: "" };
  const path = endpoint.slice(0, qIdx);
  const query = endpoint.slice(qIdx + 1);
  if (path === "/query" && query.startsWith("query=")) {
    return { url: path, qs_query: decodeURIComponent(query.slice("query=".length)) };
  }
  return { url: endpoint, qs_query: "" };
}

/** Pull the bare QBO body out of a responsive scenario-run response (tolerates
 *  outputs.tool_output.body / tool_output.body / body / raw). */
export function unwrapRunResponse(data: any): any {
  return data?.outputs?.tool_output?.body ?? data?.tool_output?.body ?? data?.body ?? data;
}

export async function qboRequestViaMake(
  cfg: MakeBridgeConfig,
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown,
): Promise<any> {
  if (!cfg.bridgeUrl) throw new Error("Make bridge not configured: missing bridgeUrl");
  // Two shapes: a Make WEBHOOK (hook.* host) takes a flat {url,method,qs_query,body}
  // and needs no token (capability URL); the scenario-RUN API takes
  // {responsive,data} + a Token. The webhook proxy scenarios are GET-only
  // (read-only) for safety.
  const isWebhook = /:\/\/hook\./.test(cfg.bridgeUrl);
  if (!isWebhook && !cfg.apiToken) throw new Error("Make bridge not configured: missing apiToken (set FIGGY_MAKE_API_TOKEN)");
  const { url, qs_query } = toMakeRequest(endpoint);
  const bodyStr = body == null ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const res = await fetch(cfg.bridgeUrl, {
    method: "POST",
    headers: isWebhook
      ? { "Content-Type": "application/json" }
      : { "Content-Type": "application/json", Authorization: `Token ${cfg.apiToken}` },
    body: JSON.stringify(isWebhook
      ? { url, method, qs_query, body: bodyStr }
      : { responsive: true, data: { url, method, qs_query, body: bodyStr } }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Make bridge ${method} ${url} failed: ${res.status} ${errText}`);
  }
  // Read as text first: a Make WEBHOOK that lacks a synchronous "Webhook Response"
  // module just acks with the literal "Accepted" (HTTP 200) and runs async — so
  // res.json() would blow up with a cryptic "Unexpected token 'A'". Detect that and
  // explain the real cause (a bridge-config issue, not the client's books).
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    const ack = text.trim().slice(0, 80);
    if (/^accepted/i.test(ack)) {
      throw new Error(
        `Make bridge for realm ${cfg.realmId} returned an async ack ("${ack}") instead of QBO data. ` +
        `The read-only bridge scenario is missing a synchronous "Webhook Response" that returns the QBO body — ` +
        `needs fixing on the Make side before reads work for this realm. (Not the books.)`,
      );
    }
    throw new Error(`Make bridge for realm ${cfg.realmId} returned non-JSON: "${ack}"`);
  }
  return unwrapRunResponse(data);
}
