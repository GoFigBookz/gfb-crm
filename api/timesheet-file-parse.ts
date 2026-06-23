/**
 * TIMESHEET FILE PARSE — read an UPLOADED detailed timesheet (TouchBistro export)
 * and extract each employee's total hours + their longest single shift (so we can
 * flag a likely missed clock-out). Works on CSV/text, PDF, or image. No Google
 * needed — the file is uploaded straight to the pay run.
 */
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function fileBlock(data: string, mediaType: string): any {
  if (mediaType === "application/pdf") return { type: "document", source: { type: "base64", media_type: mediaType, data } };
  if (mediaType.startsWith("image/")) return { type: "image", source: { type: "base64", media_type: mediaType, data } };
  // CSV / text / anything else → decode and send as text.
  const text = Buffer.from(data, "base64").toString("utf8").slice(0, 80000);
  return { type: "text", text: `DETAILED TIMESHEET (${mediaType}):\n${text}` };
}

function extractJson(text: string): any {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* noop */ } }
  return null;
}

export async function extractTimesheetFromFile(
  data: string, mediaType: string, periodStart: string, periodEnd: string,
): Promise<{ userName: string; hours: number; maxShiftHours: number }[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY isn't set — needed to read the timesheet file.");
  const model = process.env.FIGGY_CLASSIFY_MODEL || "claude-haiku-4-5";
  const system = "You read a DETAILED restaurant timesheet (one row per shift, e.g. a TouchBistro Timesheet Details export) and total hours per employee. Return ONLY JSON, no prose.";
  const prompt =
    `This is a detailed timesheet covering ${periodStart} to ${periodEnd}. Each row is one shift for one staff member. ` +
    `For EACH employee return three things:\n` +
    `- "hours": their TOTAL PAYABLE worked hours for the whole period = sum of payable regular + payable overtime hours across all their rows (use the "Payable(Reg. Hrs)" + payable OT columns if present; otherwise the paid hours, NOT the raw shift length which includes unpaid breaks).\n` +
    `- "maxShiftHours": the LARGEST single-shift "Shift Length (hrs)" value (raw clock-in to clock-out) among their rows — this catches a missed clock-out.\n` +
    `Return ONLY: {"employees":[{"name":"<Last, First as shown>","hours":<number>,"maxShiftHours":<number>}]}. ` +
    `EXCLUDE owner/admin rows (e.g. Staff Name "Admin, Admin" or Staff Type "Admin", or any row with a 0.00 rate of pay), unpaid-break rows, and any subtotal/total rows. Round hours to 2 decimals.`;
  const content = [fileBlock(data, mediaType), { type: "text", text: prompt }];
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1500, system, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) {
    const b = await res.text().catch(() => "");
    throw new Error(`Couldn't read the timesheet file (${res.status}). ${b.slice(0, 120)}`);
  }
  const json = extractJson((((await res.json()) as any).content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(""));
  const emps = (json?.employees || []) as any[];
  return emps.filter((e) => e && e.name).map((e) => ({
    userName: String(e.name),
    hours: Number(e.hours) || 0,
    maxShiftHours: Number(e.maxShiftHours) || 0,
  }));
}
