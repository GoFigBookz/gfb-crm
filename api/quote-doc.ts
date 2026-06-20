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
  // CLIENT-FACING: clean service names only — strip ALL pricing/rate/qty detail
  // and internal jargon (× $1.25/txn, amortized, wholesale, etc.).
  const clean = (label: string) => label
    .replace(/\s*—.*$/, "")                 // drop "— 750 txns × $1.25/txn"
    .replace(/\s*\(wholesale[^)]*\)/i, "")  // drop "(wholesale, 17 emp)"
    .replace(/,?\s*amortized/i, "")         // drop "amortized"
    .replace(/\s*\$\d[\d,.]*/g, "")          // drop any stray $amounts
    .replace(/\s*\(\s*\)/g, "")              // tidy empty ()
    .trim();
  const included = quote.monthlyLineItems.map((li) => `
    <li style="margin:5px 0;">${esc(clean(li.label))}</li>`).join("");

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

/** Render the branded letter of engagement — mirrors the GFB template. */
export function renderEngagementHtml(opts: {
  firm: FirmSettings; clientName: string; clientCompany?: string | null;
  monthlyFee: number | null; quote: QuoteResult; services: string[]; yearEnd?: string | null;
  contactName?: string | null; contactEmail?: string | null; address?: string | null;
  closeSchedule?: string | null; clientApps?: string[]; isCanadian?: boolean;
}): string {
  const { firm } = opts;
  const fee = opts.monthlyFee && opts.monthlyFee > 0 ? opts.monthlyFee : opts.quote.recurringMonthly;
  const legal = opts.clientCompany || opts.clientName;
  const firstName = (opts.contactName || "").trim().split(/\s+/)[0] || "there";
  const close = opts.closeSchedule || "monthly";
  const apps = (opts.clientApps && opts.clientApps.length) ? opts.clientApps.join(", ") : "as applicable";
  const servicesList = opts.services.map((s) => `<li style="margin:5px 0;">${esc(s)}</li>`).join("");
  const h = (t: string) => `<h3 style="color:${firm.accent};font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:20px 0 6px;">${t}</h3>`;

  return wrap(`
    ${header(firm, "Letter of Engagement")}
    <div style="font-size:12px;color:#64748b;">${today()}</div>
    <div style="font-size:16px;font-weight:700;margin-top:10px;">${esc(legal)}</div>
    ${opts.address ? `<div style="font-size:13px;color:#475569;">${esc(opts.address)}</div>` : ""}
    ${opts.contactName ? `<div style="font-size:13px;color:#475569;">Attention: ${esc(opts.contactName)}</div>` : ""}
    ${opts.contactEmail ? `<div style="font-size:13px;color:#475569;">${esc(opts.contactEmail)}</div>` : ""}

    <p style="margin-top:16px;">Dear ${esc(firstName)},</p>
    <p>We appreciate the opportunity of providing bookkeeping and accounting services to ${esc(legal)}. To ensure a complete understanding between us, this letter describes the scope and limitations of the services we will provide for you. Markie Antle of ${esc(firm.displayName)} will be the contact person for this engagement.</p>

    ${h("Scope of services")}
    <p style="margin:0 0 4px;">On a ${esc(close)} basis, ${esc(firm.displayName)} will provide the following services for ${esc(legal)}:</p>
    <ul style="margin:6px 0;padding-left:20px;">${servicesList || "<li>Bookkeeping &amp; accounting</li>"}</ul>
    <p>On an annual basis, we will prepare the year-end financial package for your accountant and liaise with your accountant on any year-end questions that may arise.</p>

    ${h("What we need from you")}
    <p>To perform our services effectively, we will need timely access to: bank statements, customer invoices and receipts, sales-tax account information, vendor invoices, payroll and employee data, and any other documents necessary to complete this engagement. ${esc(legal)} is solely responsible for supplying ${esc(firm.displayName)} all information necessary, and acknowledges that the accuracy of financial information supplied is its sole responsibility.</p>

    ${h("Software & system access")}
    <p>${esc(legal)} agrees to provide ${esc(firm.displayName)} access to all current accounting and business software (accounting software, banking portals / bank feeds, payroll platform, payment processors — ${esc(apps)}, document management such as Hubdoc/Dext/Drive, and any other platforms used to manage business finances).</p>

    ${opts.isCanadian !== false ? `
    ${h("CRA representative authorization")}
    <p>${esc(legal)} agrees to authorize Markie Antle of ${esc(firm.displayName)} as an authorized representative with the Canada Revenue Agency (CRA), allowing us to communicate with CRA on your behalf, file returns, and respond to CRA inquiries.</p>
    <p style="font-size:13px;"><strong>CRA Representative ID: ${esc(firm.craRepId || "[RepID]")}</strong> · Markie Antle · ${esc(firm.email)}. Please complete this authorization within 5 business days of signing (My Business Account → Authorize a representative → Level 2).</p>` : ""}

    ${h("Term & termination")}
    <p>This engagement begins on acceptance and continues on a monthly basis until terminated by either party. Either party may terminate for convenience with thirty (30) days' written notice.${opts.yearEnd ? ` The Client's fiscal year-end is ${esc(opts.yearEnd)}.` : ""}</p>

    ${h("Fees & pricing")}
    <p>Our fee for the services above is <strong>${money(fee)} per month</strong>, plus applicable GST/HST, billed at the beginning of each month and payable within 15 days of the invoice date. Pre-approved out-of-pocket expenses are billed separately. Services outside this scope will be quoted and require a separate engagement letter.</p>

    ${h("Standard of performance")}
    <p>${esc(firm.displayName)} agrees to follow the highest professional standards and adhere to all Generally Accepted Accounting Principles (GAAP).</p>

    ${h("Confidentiality")}
    <p>${esc(firm.displayName)} agrees to hold all confidential or proprietary information of ${esc(legal)} in strict confidence and shall not disclose it to third parties or use it for any purpose other than performing this engagement. These obligations survive termination.</p>

    ${h("Approvals & signatures")}
    <p>We are pleased to have you as a client. By signing below, ${esc(legal)} accepts this letter of engagement and its terms.</p>
    <p style="margin-top:10px;">Sincerely,<br/><strong>Markie Antle</strong> — ${esc(firm.displayName)}<br/>${esc(firm.email)} · ${esc(firm.phone)}</p>
    ${footer(firm)}
  `);
}
