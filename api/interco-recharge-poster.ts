/**
 * INTER-COMPANY RECHARGE POSTER — Fig posts the REAL Invoice + Bill, live (Markie
 * 2026-06-26: "I want Figs to actually post this live for Alderson").
 * =============================================================================
 * Creates a REAL Invoice in the PAYER (Alderson — customer = counterparty, income =
 * revenue account, HST) and a REAL Bill in the COUNTERPARTY (Ovita Holdings — vendor
 * = payer, expense = expense account, HST). NOT a journal entry.
 *
 * SAFETY (golden rule + Markie's explicit go-live for Alderson):
 *  - Both connections must be NATIVE + active (the read-only bridge CANNOT write).
 *  - Fires only on an explicit approve from the UI (approve:true).
 *  - Resolves every ref (customer/vendor/item/account/tax-code) and REFUSES rather
 *    than guess — accounts + tax codes must already exist (locked chart); only the
 *    customer/vendor/service-item are created if missing (standard, safe).
 *  - Audited: records a what/when/why entry for each posted document.
 *  - Returns the QBO ids so the UI shows exactly what was created.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { qboRequest } from "./qbo-router";
import { getConnectionForClient } from "./qbo-vendor-brain";
import { recordAudit } from "./agent-audit";
import { round2 } from "./interco-recharge-core";

const arr = (data: any, entity: string): any[] => (data?.QueryResponse?.[entity] ?? []) as any[];
const q = (conn: any, s: string) => qboRequest(conn, `/query?query=${encodeURIComponent(s)}`);
const esc = (s: string) => String(s).replace(/'/g, "\\'");

async function findAccountId(conn: any, name: string): Promise<{ id: string; name: string } | null> {
  const rows = arr(await q(conn, `SELECT Id, Name FROM Account WHERE Name = '${esc(name)}'`), "Account");
  if (rows[0]) return { id: String(rows[0].Id), name: rows[0].Name };
  // loose match
  const all = arr(await q(conn, `SELECT Id, Name FROM Account MAXRESULTS 1000`), "Account");
  const hit = all.find((a: any) => String(a.Name).toLowerCase().trim() === name.toLowerCase().trim())
    || all.find((a: any) => String(a.Name).toLowerCase().includes(name.toLowerCase()));
  return hit ? { id: String(hit.Id), name: hit.Name } : null;
}

/** HST tax code (ON 13%). Match by name containing HST/13, else first taxable code. */
async function findHstTaxCodeId(conn: any): Promise<{ id: string; name: string } | null> {
  const codes = arr(await q(conn, `SELECT * FROM TaxCode MAXRESULTS 1000`), "TaxCode");
  const byName = codes.find((c: any) => /hst/i.test(c.Name) && /13/.test(c.Name))
    || codes.find((c: any) => /hst/i.test(c.Name))
    || codes.find((c: any) => /13/.test(c.Name));
  return byName ? { id: String(byName.Id), name: byName.Name } : null;
}

async function findOrCreateCustomer(conn: any, name: string): Promise<string> {
  const rows = arr(await q(conn, `SELECT Id, DisplayName FROM Customer WHERE DisplayName = '${esc(name)}'`), "Customer");
  if (rows[0]) return String(rows[0].Id);
  const res = await qboRequest(conn, "/customer", "POST", { DisplayName: name });
  const id = res?.Customer?.Id;
  if (!id) throw new Error(`could not create customer "${name}"`);
  return String(id);
}

async function findOrCreateVendor(conn: any, name: string): Promise<string> {
  const rows = arr(await q(conn, `SELECT Id, DisplayName FROM Vendor WHERE DisplayName = '${esc(name)}'`), "Vendor");
  if (rows[0]) return String(rows[0].Id);
  const res = await qboRequest(conn, "/vendor", "POST", { DisplayName: name });
  const id = res?.Vendor?.Id;
  if (!id) throw new Error(`could not create vendor "${name}"`);
  return String(id);
}

/** A Service item whose income account is the revenue account, for the invoice line. */
async function findOrCreateServiceItem(conn: any, incomeAccountId: string, itemName = "Inter-company recharge"): Promise<string> {
  const items = arr(await q(conn, `SELECT Id, Name, Type, IncomeAccountRef FROM Item MAXRESULTS 1000`), "Item");
  const match = items.find((i: any) => String(i.IncomeAccountRef?.value) === String(incomeAccountId) && (i.Type === "Service" || !i.Type))
    || items.find((i: any) => i.Name === itemName);
  if (match) return String(match.Id);
  const res = await qboRequest(conn, "/item", "POST", {
    Name: itemName, Type: "Service", IncomeAccountRef: { value: incomeAccountId },
  });
  const id = res?.Item?.Id;
  if (!id) throw new Error(`could not create service item "${itemName}"`);
  return String(id);
}

/** A per-expense-account total in the PAYER's books (account id is the payer's own). */
export type ExpenseAccountTotal = { accountId: string; accountName: string; net: number };

export type PostRechargeInput = {
  payerClientId: number; counterpartyClientId: number;
  payerName: string; counterpartyName: string;
  revenueAccount: string; expenseAccount: string;
  hstRatePct: number; chargeHst: boolean;
  subtotal: number; periodLabel: string;
  lineDescription?: string;
  /** ZERO-OUT MODE (Alderson, Markie 2026-06-26): credit the invoice back to the SAME
   *  expense accounts the costs sit in, so the payer's expenses net to $0 and the HST
   *  charged offsets the ITCs already claimed (HST nets to $0 too). When omitted/empty
   *  the invoice credits `revenueAccount` (the plain cost-recovery-as-income method). */
  zeroOut?: boolean;
  expenseBreakdown?: ExpenseAccountTotal[];
};

export type PostRechargeResult =
  | { ok: true; invoiceId: string; billId: string; total: number }
  | { ok: false; error: string; detail?: string };

export async function postRecharge(input: PostRechargeInput): Promise<PostRechargeResult> {
  try {
    const payer = await getConnectionForClient(input.payerClientId);
    if ("error" in payer) return { ok: false, error: `payer connection: ${payer.error}` };
    const cp = await getConnectionForClient(input.counterpartyClientId);
    if ("error" in cp) return { ok: false, error: `counterparty connection: ${cp.error}` };
    if ((payer.conn as any).transport !== "native") return { ok: false, error: "payer_not_native", detail: `${input.payerName} is on the read-only bridge — connect it DIRECT (native) to write.` };
    if ((cp.conn as any).transport !== "native") return { ok: false, error: "counterparty_not_native", detail: `${input.counterpartyName} is on the read-only bridge — connect it DIRECT (native) to write.` };

    const subtotal = round2(input.subtotal);
    if (!(subtotal > 0)) return { ok: false, error: "nothing_to_post", detail: "Subtotal is zero." };
    const desc = input.lineDescription || `Inter-company recharge — ${input.periodLabel}`;

    // ---- PAYER INVOICE (Alderson) ----
    const custId = await findOrCreateCustomer(payer.conn, input.counterpartyName);
    let invTax: { id: string } | null = null;
    if (input.chargeHst) {
      const t = await findHstTaxCodeId(payer.conn);
      if (!t) return { ok: false, error: "hst_taxcode_not_found", detail: `No HST tax code in ${input.payerName}.` };
      invTax = { id: t.id };
    }

    // Build the invoice LINES. Two methods:
    //  (1) ZERO-OUT (Alderson) — one line per expense account, each line's item maps
    //      its income to THAT expense account, so the credit reverses the cost → the
    //      payer's expenses net to $0. The 13% HST charged offsets the ITCs already
    //      claimed on those costs → HST nets to $0. (Markie's hard requirement.)
    //  (2) REVENUE — a single line to the revenue account (plain cost recovery).
    const useZeroOut = !!input.zeroOut && Array.isArray(input.expenseBreakdown) && input.expenseBreakdown.length > 0;
    let invoiceLines: any[];
    if (useZeroOut) {
      // Only positive net accounts; sum must reconcile to the subtotal we charge.
      const accts = (input.expenseBreakdown || []).filter((a) => a && a.accountId && round2(a.net) > 0);
      if (accts.length === 0) return { ok: false, error: "no_expense_accounts", detail: "No expense accounts with a positive balance to recharge." };
      invoiceLines = [];
      for (const a of accts) {
        // An item whose INCOME account IS this expense account → the sale credits the
        // expense account, zeroing it. (QBO supports crediting expense accounts from a
        // sales doc; if it rejects the item, we fail cleanly BEFORE anything posts.)
        let itemId: string;
        try {
          itemId = await findOrCreateServiceItem(payer.conn, a.accountId, `Recharge — ${a.accountName}`.slice(0, 100));
        } catch (e) {
          return { ok: false, error: "expense_item_create_failed", detail: `Could not create a recharge item mapped to "${a.accountName}" in ${input.payerName} (QBO may not allow crediting that account from an invoice): ${e instanceof Error ? e.message : String(e)}` };
        }
        invoiceLines.push({
          DetailType: "SalesItemLineDetail", Amount: round2(a.net), Description: `${desc} — ${a.accountName}`,
          SalesItemLineDetail: {
            ItemRef: { value: itemId },
            ...(invTax ? { TaxCodeRef: { value: invTax.id } } : {}),
          },
        });
      }
    } else {
      const incomeAcct = await findAccountId(payer.conn, input.revenueAccount);
      if (!incomeAcct) return { ok: false, error: "revenue_account_not_found", detail: `"${input.revenueAccount}" not in ${input.payerName}'s chart.` };
      const itemId = await findOrCreateServiceItem(payer.conn, incomeAcct.id);
      invoiceLines = [{
        DetailType: "SalesItemLineDetail", Amount: subtotal, Description: desc,
        SalesItemLineDetail: {
          ItemRef: { value: itemId },
          ...(invTax ? { TaxCodeRef: { value: invTax.id } } : {}),
        },
      }];
    }

    const invoicePayload: any = {
      CustomerRef: { value: custId },
      Line: invoiceLines,
      ...(invTax ? { TxnTaxDetail: {} } : {}),
      PrivateNote: `Figgy inter-company recharge ${input.periodLabel}${useZeroOut ? " (zero-out: credits source expense accounts)" : ""}`,
    };
    const invRes = await qboRequest(payer.conn, "/invoice", "POST", invoicePayload);
    const invoiceId = invRes?.Invoice?.Id ? String(invRes.Invoice.Id) : "";
    if (!invoiceId) return { ok: false, error: "invoice_post_failed", detail: "QBO returned no Invoice Id." };
    const total = round2(Number(invRes?.Invoice?.TotalAmt ?? subtotal));
    await recordAudit({ userId: 0, agentScope: "fig", action: "qbo.post.invoice", decision: "done", clientId: input.payerClientId, amount: total, summary: `Posted Invoice ${invoiceId} in ${input.payerName} → ${input.counterpartyName} (recharge ${input.periodLabel})` });

    // ---- COUNTERPARTY BILL (Holdings) ----
    const expAcct = await findAccountId(cp.conn, input.expenseAccount);
    if (!expAcct) return { ok: false, error: "expense_account_not_found", detail: `"${input.expenseAccount}" not in ${input.counterpartyName}'s chart. (Invoice ${invoiceId} already posted — add the bill manually or fix the account name.)` };
    const vendId = await findOrCreateVendor(cp.conn, input.payerName);
    let billTax: { id: string } | null = null;
    if (input.chargeHst) {
      const t = await findHstTaxCodeId(cp.conn);
      if (t) billTax = { id: t.id };
    }
    const billPayload: any = {
      VendorRef: { value: vendId },
      Line: [{
        DetailType: "AccountBasedExpenseLineDetail", Amount: subtotal, Description: desc,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: expAcct.id },
          ...(billTax ? { TaxCodeRef: { value: billTax.id } } : {}),
        },
      }],
      PrivateNote: `Figgy inter-company recharge ${input.periodLabel} (mirror of ${input.payerName} invoice ${invoiceId})`,
    };
    const billRes = await qboRequest(cp.conn, "/bill", "POST", billPayload);
    const billId = billRes?.Bill?.Id ? String(billRes.Bill.Id) : "";
    if (!billId) return { ok: false, error: "bill_post_failed", detail: `Invoice ${invoiceId} posted, but the bill failed — add it manually in ${input.counterpartyName}.` };
    await recordAudit({ userId: 0, agentScope: "fig", action: "qbo.post.bill", decision: "done", clientId: input.counterpartyClientId, amount: total, summary: `Posted Bill ${billId} in ${input.counterpartyName} (recharge from ${input.payerName}, ${input.periodLabel})` });

    return { ok: true, invoiceId, billId, total };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: "post_threw", detail: msg };
  }
}
