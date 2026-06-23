/**
 * TIMESHEET FILE PARSE — read a DETAILED timesheet (TouchBistro "Timesheet
 * Details" export) and total each employee's hours + their longest single shift
 * (to flag a likely missed clock-out).
 *
 * CSV/TEXT is parsed DETERMINISTICALLY here — no AI, no API key, no network — so
 * it can't fail on a missing key or a flaky model. AI is used ONLY as a fallback
 * for PDF/image files (which we can't parse as text).
 */
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export type TimesheetRow = { userName: string; hours: number; maxShiftHours: number };

/** Minimal RFC-4180-ish CSV line splitter (handles quoted fields w/ commas). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function num(s: string | undefined): number {
  const n = parseFloat(String(s ?? "").replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : 0;
}

/** Find the index of the first header column whose name matches any needle. */
function colIdx(header: string[], needles: string[]): number {
  const h = header.map((x) => x.toLowerCase());
  for (let i = 0; i < h.length; i++) {
    if (needles.some((n) => h[i].includes(n))) return i;
  }
  return -1;
}

/**
 * Parse a TouchBistro-style detailed timesheet CSV. One row per shift; columns
 * include Staff Name, Staff Type, Shift Length (hrs), Payable(Reg. Hrs) and
 * payable OT. Totals payable hours per employee; tracks the longest shift.
 */
export function parseTimesheetCsv(text: string): TimesheetRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  // Find the header row (the one with "Staff Name"); default to the first line.
  let headerIdx = lines.findIndex((l) => /staff\s*name|employee|name/i.test(l) && /shift|hour|hrs|payable|clock/i.test(l));
  if (headerIdx < 0) headerIdx = 0;
  const header = splitCsvLine(lines[headerIdx]);

  const iName = colIdx(header, ["staff name", "employee", "name"]);
  const iType = colIdx(header, ["staff type", "role", "type"]);
  const iShift = colIdx(header, ["shift length"]);
  const iRate = colIdx(header, ["rate of pay", "reg. rate", "rate"]);
  // Payable columns (preferred for paid hours). May be several (reg + OT tiers).
  const iPayables: number[] = [];
  header.forEach((h, i) => { if (/payable/i.test(h) && /hr|hour/i.test(h)) iPayables.push(i); });
  const iTotalReg = colIdx(header, ["total(reg", "total reg", "reg. hrs", "regular hours"]);

  const agg = new Map<string, { hours: number; max: number }>();
  for (let r = headerIdx + 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);
    const name = (iName >= 0 ? cells[iName] : cells[0] || "").trim();
    if (!name) continue;
    const lname = name.toLowerCase();
    if (lname.startsWith("report summary") || lname.startsWith("total") || lname.startsWith("subtotal")) continue;
    const type = (iType >= 0 ? cells[iType] : "").trim().toLowerCase();
    if (type === "admin" || lname === "admin, admin" || lname.startsWith("admin,")) continue;

    const shift = iShift >= 0 ? num(cells[iShift]) : 0;
    let payable = 0;
    if (iPayables.length) for (const i of iPayables) payable += num(cells[i]);
    else if (iTotalReg >= 0) payable = num(cells[iTotalReg]);
    else payable = shift;

    const a = agg.get(name) || { hours: 0, max: 0 };
    a.hours += payable;
    a.max = Math.max(a.max, shift || payable);
    agg.set(name, a);
  }
  return Array.from(agg.entries()).map(([userName, a]) => ({
    userName,
    hours: Math.round(a.hours * 100) / 100,
    maxShiftHours: Math.round(a.max * 100) / 100,
  }));
}

function looksLikeCsv(text: string): boolean {
  const head = text.slice(0, 2000).toLowerCase();
  return head.includes(",") && (head.includes("staff") || head.includes("name") || head.includes("shift") || head.includes("hour"));
}

function extractJson(text: string): any {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* noop */ } }
  return null;
}

/** AI fallback for PDF/image timesheets (can't parse those as text). */
async function extractViaAi(
  data: string, mediaType: string, periodStart: string, periodEnd: string,
): Promise<TimesheetRow[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("This is a PDF/image timesheet and ANTHROPIC_API_KEY isn't set. Export the DETAILED timesheet as CSV instead — CSV is read directly with no AI needed.");
  const model = process.env.FIGGY_CLASSIFY_MODEL || "claude-haiku-4-5";
  const fileBlock = mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: mediaType, data } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data } };
  const system = "You read a DETAILED restaurant timesheet (one row per shift) and total hours per employee. Return ONLY JSON, no prose.";
  const prompt =
    `Detailed timesheet covering ${periodStart} to ${periodEnd}. For EACH employee return "hours" (total PAYABLE regular + OT hours, not raw shift length) and "maxShiftHours" (largest single Shift Length, to catch a missed clock-out). ` +
    `Return ONLY {"employees":[{"name":"<Last, First>","hours":<n>,"maxShiftHours":<n>}]}. EXCLUDE Admin/owner/0-rate rows and subtotal/total rows.`;
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1500, system, messages: [{ role: "user", content: [fileBlock, { type: "text", text: prompt }] }] }),
  });
  if (!res.ok) {
    const b = await res.text().catch(() => "");
    throw new Error(`Couldn't read the PDF/image timesheet (${res.status}). ${b.slice(0, 120)}`);
  }
  const json = extractJson((((await res.json()) as any).content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(""));
  return ((json?.employees || []) as any[]).filter((e) => e && e.name).map((e) => ({
    userName: String(e.name), hours: Number(e.hours) || 0, maxShiftHours: Number(e.maxShiftHours) || 0,
  }));
}

export async function extractTimesheetFromFile(
  data: string, mediaType: string, periodStart: string, periodEnd: string,
): Promise<TimesheetRow[]> {
  // PDF / image → AI (can't read as text). Everything else → decode + parse here.
  if (mediaType === "application/pdf" || mediaType.startsWith("image/")) {
    return extractViaAi(data, mediaType, periodStart, periodEnd);
  }
  const text = Buffer.from(data, "base64").toString("utf8");
  if (looksLikeCsv(text) || mediaType.includes("csv") || mediaType.includes("text")) {
    const rows = parseTimesheetCsv(text);
    if (rows.length) return rows;
  }
  // Unknown text shape — last resort, let the AI try (if configured).
  return extractViaAi(data, mediaType, periodStart, periodEnd);
}
