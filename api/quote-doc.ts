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
    <div style="display:flex;align-items:center;gap:14px;">
      <img src="${firm.logoDataUri}" alt="${esc(firm.displayName)}" style="height:56px;width:auto;border-radius:6px;" />
      <div>
        <div style="font-size:22px;font-weight:700;color:#1e293b;">${esc(firm.displayName)}</div>
        <div style="font-size:12px;color:#64748b;">${esc(firm.email)} · ${esc(firm.phone)} · ${esc(firm.website)}</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:18px;font-weight:600;color:${firm.accent};text-transform:uppercase;letter-spacing:1px;">${esc(docTitle)}</div>
      <div style="font-size:12px;color:#64748b;">${today()}</div>
    </div>
  </div>`;
}

function footer(firm: FirmSettings): string {
  return `
  <div style="border-top:1px solid #e2e8f0;margin-top:28px;padding-top:12px;font-size:11px;color:#94a3b8;text-align:center;">
    ${esc(firm.legalName)} ${esc(firm.legalSuffix)} · GST/HST# ${esc(firm.hstNumber)} · ${esc(firm.website)}
  </div>`;
}

function wrap(inner: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1e293b;max-width:720px;margin:0 auto;padding:8px 4px;line-height:1.5;">${inner}</div>`;
}

/** Render the branded, scope-based quote document. */
export function renderQuoteHtml(opts: {
  firm: FirmSettings; clientName: string; clientCompany?: string | null;
  quote: QuoteResult; comparison: QuoteComparison;
}): string {
  const { firm, quote } = opts;
  const rows = quote.monthlyLineItems.map((li) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
        <div style="font-weight:500;">${esc(li.label)}</div>
        <div style="font-size:12px;color:#94a3b8;">${esc(li.rationale)}</div>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap;">${money(li.amount)}/mo</td>
    </tr>`).join("");
  const oneTime = quote.oneTimeLineItems.map((li) => `
    <tr>
      <td style="padding:6px 0;color:#475569;">${esc(li.label)}<div style="font-size:12px;color:#94a3b8;">${esc(li.rationale)}</div></td>
      <td style="padding:6px 0;text-align:right;white-space:nowrap;color:#475569;">${money(li.amount)}</td>
    </tr>`).join("");

  return wrap(`
    ${header(firm, "Quote")}
    <p style="margin:0 0 4px;">Prepared for</p>
    <div style="font-size:18px;font-weight:600;margin-bottom:18px;">${esc(opts.clientCompany || opts.clientName)}</div>

    <p>Thank you for the opportunity to support your bookkeeping. Below is a scope-based monthly quote built from the services your business needs (${esc(quote.tier)}).</p>

    <table style="width:100%;border-collapse:collapse;margin-top:12px;">
      <thead><tr>
        <th style="text-align:left;font-size:12px;text-transform:uppercase;color:#94a3b8;padding-bottom:6px;">Monthly services</th>
        <th style="text-align:right;font-size:12px;text-transform:uppercase;color:#94a3b8;padding-bottom:6px;">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td style="padding-top:12px;font-weight:700;font-size:16px;">Recurring monthly total</td>
        <td style="padding-top:12px;font-weight:700;font-size:16px;text-align:right;color:${firm.accent};">${money(quote.recurringMonthly)}/mo</td>
      </tr></tfoot>
    </table>

    ${oneTime ? `
    <table style="width:100%;border-collapse:collapse;margin-top:20px;">
      <thead><tr>
        <th style="text-align:left;font-size:12px;text-transform:uppercase;color:#94a3b8;padding-bottom:6px;">One-time</th>
        <th style="text-align:right;font-size:12px;text-transform:uppercase;color:#94a3b8;padding-bottom:6px;">Amount</th>
      </tr></thead>
      <tbody>${oneTime}</tbody>
      <tfoot><tr>
        <td style="padding-top:8px;font-weight:600;">One-time total</td>
        <td style="padding-top:8px;font-weight:600;text-align:right;">${money(quote.oneTimeTotal)}</td>
      </tr></tfoot>
    </table>` : ""}

    <p style="font-size:12px;color:#64748b;margin-top:16px;">All amounts in CAD and exclusive of GST/HST. Quote valid for 30 days. Recurring fees billed monthly; scope reviewed if transaction volume or services change.</p>
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
