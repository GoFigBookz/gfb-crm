/**
 * FAX CORE — pure helpers for the Send-a-Fax tool. No I/O here (the router does
 * the HTTP POST + DB write); this normalizes numbers and builds/parses the
 * provider request so it's all unit-testable without a live fax account.
 *
 * Provider: SRFax (Canadian; data stays in Canada — the right call for faxing
 * CRA + client tax documents). Built behind a thin seam so another provider
 * (Telnyx/Documo) can be added later without touching the UI.
 *
 * Inputs:  raw fax numbers + a file (base64) + optional cover-page fields.
 * Outputs: a normalized number, a validity check, the SRFax param map, and a
 *          parsed {ok, reference|error} from SRFax's response.
 * Errors:  pure — never throws; invalid input returns a falsey validity.
 * Limitations: validation covers NANP (Canada/US) numbers; international is
 *   passed through digits-only and flagged invalid by isValidFaxNumber.
 */

/** Strip to digits and put NANP numbers in 11-digit (1 + area + line) form. */
export function normalizeFaxNumber(raw: string): string {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  if (digits.length === 10) return "1" + digits;
  return digits; // leave anything else as-is (caller validates)
}

/** True only for a complete NANP (Canada/US) fax number. */
export function isValidFaxNumber(raw: string): boolean {
  const d = normalizeFaxNumber(raw);
  return d.length === 11 && d.startsWith("1") && d[1] !== "0" && d[1] !== "1";
}

/** Pretty (123) 456-7890 for display; falls back to the raw input if not NANP. */
export function formatFaxNumber(raw: string): string {
  const d = normalizeFaxNumber(raw);
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return String(raw || "");
}

export interface SrFaxConfig {
  accessId: string;
  accessPwd: string;
  callerId: string;      // your SRFax account fax number, 10 digits
  senderEmail: string;   // confirmation emails land here
}

export interface FaxSendOptions {
  toNumber: string;
  fileName: string;
  fileContentB64: string;   // base64 of the PDF/TIFF (no data: prefix)
  coverPage?: string | null;     // SRFax cover template, e.g. "Standard"; null = none
  coverTo?: string | null;
  coverFrom?: string | null;
  subject?: string | null;
  comments?: string | null;
}

/** Build the SRFax Queue_Fax parameter map (form-urlencoded by the router). */
export function buildSrFaxQueueParams(cfg: SrFaxConfig, o: FaxSendOptions): Record<string, string> {
  const params: Record<string, string> = {
    action: "Queue_Fax",
    access_id: cfg.accessId,
    access_pwd: cfg.accessPwd,
    sCallerID: String(cfg.callerId || "").replace(/[^\d]/g, "").slice(-10),
    sSenderEmail: cfg.senderEmail,
    sFaxType: "SINGLE",
    sToFaxNumber: normalizeFaxNumber(o.toNumber),
    sFileName_1: o.fileName,
    sFileContent_1: o.fileContentB64,
    sResponseFormat: "JSON",
  };
  if (o.coverPage) {
    params.sCoverPage = o.coverPage;
    if (o.coverTo) params.sCPToName = o.coverTo;
    if (o.coverFrom) params.sCPFromName = o.coverFrom;
    if (o.subject) params.sCPSubject = o.subject;
    if (o.comments) params.sCPComments = o.comments;
  }
  return params;
}

/** Parse SRFax's JSON response into a uniform result. */
export function parseSrFaxResponse(json: any): { ok: boolean; reference?: string; error?: string } {
  const status = String(json?.Status ?? "").toLowerCase();
  if (status === "success") return { ok: true, reference: String(json?.Result ?? "") };
  const err = json?.Result ?? json?.Error ?? "Fax provider returned an error";
  return { ok: false, error: typeof err === "string" ? err : JSON.stringify(err) };
}
