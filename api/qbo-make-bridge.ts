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

/** Split an endpoint the brain built (e.g. "/query?query=SELECT..%20") into the
 *  url + qs_query the per-realm scenario expects. The brain encodes SQL as
 *  `?query=<urlencoded>`; the scenario wants the raw SQL in `qs_query`. Other
 *  endpoints (e.g. reports) pass their path through as `url`. */
export function toMakeRequest(endpoint: string): { url: string; qs_query: string } {
  const qIdx = endpoint.indexOf("?");
  const url = qIdx >= 0 ? endpoint.slice(0, qIdx) : endpoint;
  let qs_query = qIdx >= 0 ? endpoint.slice(qIdx + 1) : "";
  if (qs_query.startsWith("query=")) qs_query = decodeURIComponent(qs_query.slice("query=".length));
  return { url, qs_query };
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
  if (!cfg.bridgeUrl) throw new Error("Make bridge not configured: missing bridgeUrl (scenario run endpoint)");
  if (!cfg.apiToken) throw new Error("Make bridge not configured: missing apiToken (set FIGGY_MAKE_API_TOKEN)");
  const { url, qs_query } = toMakeRequest(endpoint);
  const bodyStr = body == null ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const res = await fetch(cfg.bridgeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Token ${cfg.apiToken}` },
    body: JSON.stringify({ responsive: true, data: { url, method, qs_query, body: bodyStr } }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Make bridge run ${method} ${url} failed: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return unwrapRunResponse(data);
}
