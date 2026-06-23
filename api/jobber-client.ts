/**
 * JOBBER GRAPHQL CLIENT + timesheet-hours aggregation.
 * =============================================================================
 * Read-only. Pulls TimeSheetEntry records for a date range and totals the worked
 * seconds per Jobber user → hours. The payroll router maps Jobber users → CRM
 * employees and fills the pay-run timesheet. We don't compute pay here — that's QBO.
 *
 * The exact GraphQL filter shape isn't fully documented, so errors are surfaced
 * verbatim to the caller (and we date-filter client-side as a backstop) — that lets
 * us confirm the query against the live account without guessing blind.
 * =============================================================================
 */
import { getValidConnection, bearerFor, JOBBER_GRAPHQL_URL, JOBBER_API_VERSION } from "./jobber-oauth";
import { easternDayRangeUtc } from "./timesheet-core";

export type JobberHours = { userId: string; userName: string; seconds: number; hours: number; maxShiftHours: number };

/** Low-level GraphQL POST against a client's Jobber connection. */
export async function jobberGraphql(clientId: number, query: string, variables: Record<string, any> = {}): Promise<any> {
  const conn = await getValidConnection(clientId);
  if (!conn) throw new Error("not_connected");
  const res = await fetch(JOBBER_GRAPHQL_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearerFor(conn)}`,
      "content-type": "application/json",
      "X-JOBBER-GRAPHQL-VERSION": JOBBER_API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Jobber GraphQL ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  if (json.errors) throw new Error(`Jobber GraphQL error: ${JSON.stringify(json.errors).slice(0, 400)}`);
  return json.data;
}

/** Quick auth/version sanity check — returns a few users. */
export async function jobberTestUsers(clientId: number): Promise<{ id: string; name: string }[]> {
  const data = await jobberGraphql(clientId, `query { users(first: 5) { nodes { id name { full } } } }`);
  return (data?.users?.nodes ?? []).map((u: any) => ({ id: u.id, name: u?.name?.full ?? "" }));
}

const TIMESHEET_QUERY = `
  query($after: String, $start: ISO8601DateTime, $end: ISO8601DateTime) {
    timeSheetEntries(first: 100, after: $after, filter: { startAt: { after: $start, before: $end } }) {
      nodes { id finalDuration startAt user { id name { full } } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

/** Total worked hours per Jobber user across [startISO, endISO] (inclusive day range). */
export async function importTimesheetHours(clientId: number, startISO: string, endISO: string): Promise<JobberHours[]> {
  // Eastern day boundaries → exact UTC instants (DST-aware) so a late-evening
  // shift at the edge of the pay period isn't missed or double-counted.
  const { start, end } = easternDayRangeUtc(startISO, endISO);
  const totals = new Map<string, JobberHours>();
  let after: string | null = null;
  let guard = 0;
  do {
    const data: any = await jobberGraphql(clientId, TIMESHEET_QUERY, { after, start, end });
    const conn = data?.timeSheetEntries;
    for (const n of conn?.nodes ?? []) {
      // Backstop client-side date filter in case the server filter is loose.
      if (n.startAt && (n.startAt < start || n.startAt > end)) continue;
      const uid = n?.user?.id;
      if (!uid) continue;
      const secs = Number(n.finalDuration) || 0;
      const cur = totals.get(uid) || { userId: uid, userName: n?.user?.name?.full ?? "", seconds: 0, hours: 0, maxShiftHours: 0 };
      cur.seconds += secs;
      const entryHours = Math.round((secs / 3600) * 100) / 100;
      if (entryHours > cur.maxShiftHours) cur.maxShiftHours = entryHours; // longest single shift = missed-clock-out signal
      totals.set(uid, cur);
    }
    after = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after && ++guard < 25);

  return Array.from(totals.values()).map((t) => ({ ...t, hours: Math.round((t.seconds / 3600) * 100) / 100 }));
}
