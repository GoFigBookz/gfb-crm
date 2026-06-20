/**
 * FIGGY JR — BRANDED DOCUMENT RENDERER (quote + engagement letter)
 * =============================================================================
 * Turns the scope-based quote + client into clean, professional, self-contained
 * HTML (logo embedded as a data URI, no external assets) for the in-app e-sign
 * portal. Legally correct footer: the numbered legal entity + CRA/HST number.
 * Design kept simple/clean (Asana-style) — lots of whitespace, one accent.
 * =============================================================================
 */
import type { FirmSettings } from "./firm-settings";
import type { QuoteResult, QuoteComparison } from "./quote-core";

const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const money = (n: number) => `$${Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const today = () => new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });

function header(firm: FirmSettings, docTitle: string): string {
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid ${firm.accent};padding-bottom:16px;margin-bottom:24px;">
    <div>
      <img src="${firm.logoDataUri}" alt="${esc(firm.displayName)}" style="height:64px;width:auto;display:block;" />
    </div>
    <div style="text-align:right;">
      <div style="font-size:18px;font-weight:600;color:${firm.accent};text-transform:uppercase;letter-spacing:1px;">${esc(docTitle)}</div>
      <div style="font-size:12px;color:#64748b;">${today()}</div>
    </div>
  </div>`;
}

function footer(firm: FirmSettings): string {
  return `
  <div style="border-top:1px solid #e2e8f0;margin-top:28px;padding-top:12px;font-size:11px;color:#94a3b8;text-align:center;line-height:1.6;">
    <div style="color:#64748b;font-weight:600;">${esc(firm.displayName)} · ${esc(firm.email)} · ${esc(firm.phone)} · ${esc(firm.website)}</div>
    ${esc(firm.legalName)} ${esc(firm.legalSuffix)} · GST/HST# ${esc(firm.hstNumber)}
  </div>`;
}

function wrap(inner: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1e293b;max-width:720px;margin:0 auto;padding:8px 4px;line-height:1.5;">${inner}</div>`;
}

/** Render the branded, scope-based quote document. */
export function renderQuoteHtml(opts: {
  firm: FirmSettings; clientName: string; clientCompany?: string | null;
  quote: QuoteResult; comparison: QuoteComparison; quoteNumber?: string | null;
}): string {
  const { firm, quote } = opts;
  // CLIENT-FACING: list what's INCLUDED (no per-line prices) + ONE total. The
  // granular per-line amounts stay internal (CRM only).
  const included = quote.monthlyLineItems.map((li) => `
    <li style="margin:5px 0;">${esc(li.label)}</li>`).join("");

  return wrap(`
    ${header(firm, opts.quoteNumber ? `Quote ${opts.quoteNumber}` : "Quote")}
    <p style="margin:0 0 4px;">Prepared for</p>
    <div style="font-size:18px;font-weight:600;margin-bottom:18px;">${esc(opts.clientCompany || opts.clientName)}</div>

    <p>Thank you for the opportunity to support your bookkeeping. Your monthly engagement includes:</p>

    <ul style="margin:8px 0 18px;padding-left:20px;color:#334155;">${included}</ul>

    <div style="display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-top:8px;">
      <div style="font-size:16px;font-weight:700;color:#1e293b;">Monthly total</div>
      <div style="font-size:24px;font-weight:800;color:${firm.accent};">${money(quote.recurringMonthly)}<span style="font-size:14px;font-weight:600;color:#64748b;">/month</span></div>
    </div>

    ${quote.oneTimeTotal > 0 ? `
    <div style="display:flex;align-items:center;justify-content:space-between;border-radius:10px;padding:10px 20px;margin-top:10px;">
      <div style="font-size:14px;font-weight:600;color:#475569;">One-time setup${quote.oneTimeLineItems.some(l => /catch/i.test(l.label)) ? " &amp; catch-up" : ""}</div>
      <div style="font-size:16px;font-weight:700;color:#475569;">${money(quote.oneTimeTotal)}</div>
    </div>` : ""}

    <p style="font-size:12px;color:#64748b;margin-top:16px;">All amounts in CAD, plus applicable GST/HST. Quote valid for 30 days. Fees are reviewed if transaction volume or the scope of services changes.</p>
    <p style="margin-top:18px;">By signing below, you accept this quote and authorize ${esc(firm.displayName)} to proceed to a letter of engagement.</p>
    ${footer(firm)}
  `);
}

/** Render a branded CRA Represent-a-Client (RAC) authorization request. */
export function renderCraAuthRequestHtml(opts: {
  firm: FirmSettings; clientName: string; clientCompany?: string | null;
}): string {
  const { firm } = opts;
  const repLine = firm.craRepId
    ? `our RepID <strong>${esc(firm.craRepId)}</strong>`
    : `our RepID <strong style="color:#dc2626;">[RepID to be provided]</strong>`;
  return wrap(`
    ${header(firm, "CRA Authorization Request")}
    <div style="font-size:16px;font-weight:600;margin-bottom:14px;">${esc(opts.clientCompany || opts.clientName)}</div>
    <p>To let ${esc(firm.displayName)} manage your CRA accounts (file returns, view balances, handle correspondence), we need <strong>Represent a Client (RAC)</strong> authorization.</p>
    <h3 style="color:${firm.accent};font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-top:18px;">How to authorize us (2 minutes)</h3>
    <ol style="margin:6px 0;padding-left:20px;line-height:1.8;">
      <li>Sign in to <strong>CRA My Business Account</strong> (canada.ca → My Business Account).</li>
      <li>Go to <strong>Profile → Authorized representatives → Authorize a representative</strong>.</li>
      <li>Enter ${repLine}.</li>
      <li>Set access to <strong>Level 2 (update)</strong> for all program accounts, and submit.</li>
    </ol>
    <p>Once you approve it, we'll get a confirmation and can take it from there. Reply to this if you'd like us to walk through it together.</p>
    <p style="margin-top:16px;">By signing below you confirm you've authorized ${esc(firm.displayName)} (${repLine.replace(/<[^>]+>/g, "")}) as your CRA representative.</p>
    ${footer(firm)}
  `);
}

/** Render the branded letter of engagement. */
export function renderEngagementHtml(opts: {
  firm: FirmSettings; clientName: string; clientCompany?: string | null;
  monthlyFee: number | null; quote: QuoteResult; services: string[]; yearEnd?: string | null;
}): string {
  const { firm } = opts;
  const fee = opts.monthlyFee && opts.monthlyFee > 0 ? opts.monthlyFee : opts.quote.recurringMonthly;
  const servicesList = opts.services.map((s) => `<li style="margin:4px 0;">${esc(s)}</li>`).join("");
  return wrap(`
    ${header(firm, "Letter of Engagement")}
    <p style="margin:0 0 4px;">Between</p>
    <div style="font-size:16px;font-weight:600;">${esc(firm.legalName)} ${esc(firm.legalSuffix)}</div>
    <p style="margin:8px 0 4px;">and</p>
    <div style="font-size:16px;font-weight:600;margin-bottom:18px;">${esc(opts.clientCompany || opts.clientName)}</div>

    <p>This letter confirms the terms under which ${esc(firm.displayName)} will provide bookkeeping and related services to ${esc(opts.clientCompany || opts.clientName)} ("the Client").</p>

    <h3 style="color:${firm.accent};font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-top:20px;">Scope of services</h3>
    <ul style="margin:6px 0;padding-left:20px;">${servicesList || "<li>Bookkeeping &amp; accounting</li>"}</ul>

    <h3 style="color:${firm.accent};font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-top:20px;">Fees</h3>
    <p>Recurring professional fee of <strong>${money(fee)}/month</strong> plus applicable GST/HST, billed monthly. One-time setup/catch-up billed separately as quoted. Fees are reviewed if scope or transaction volume changes materially.</p>

    <h3 style="color:${firm.accent};font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-top:20px;">Responsibilities</h3>
    <p>The Client is responsible for the completeness and accuracy of records provided and for timely access to source documents and accounts. ${esc(firm.displayName)} will maintain the books, prepare the agreed filings, and keep the Client informed of deadlines. ${esc(firm.displayName)} does not audit the records and relies on information provided.</p>

    <h3 style="color:${firm.accent};font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-top:20px;">Term</h3>
    <p>This engagement begins on acceptance and continues month-to-month until terminated by either party with 30 days' written notice.${opts.yearEnd ? ` The Client's fiscal year-end is ${esc(opts.yearEnd)}.` : ""}</p>

    <p style="margin-top:18px;">By signing below, the Client accepts this letter of engagement and its terms.</p>
    ${footer(firm)}
  `);
}
