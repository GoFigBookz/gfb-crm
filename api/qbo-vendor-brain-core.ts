/**
 * FIGGY JR — ACCOUNT-SELECTION BRAIN: PURE CORE (no I/O, no imports)
 * =============================================================================
 * All the decision logic lives here as pure, deterministic functions so it can
 * be unit-tested in isolation and reused by the I/O layer (qbo-vendor-brain.ts).
 *
 * Per-client isolation note: this core only ever sees ONE vendor's history,
 * already scoped to a single client's QBO realm by the caller. It has no access
 * to any datastore and cannot reach another client's data — isolation is
 * enforced upstream by which QBO connection/realm the caller hands in.
 * =============================================================================
 */

export type CodingEntry = {
  accountId: string;
  accountName: string;
  taxCode: string | null;
  source: "bill" | "expense";
  date: string; // ISO yyyy-mm-dd
  amount: number;
  txnId: string;
  docNumber: string | null;
};

export type RankedAccount = {
  accountId: string;
  accountName: string;
  taxCode: string | null;
  count: number;
  lastDate: string;
  totalAmount: number;
};

export type CodingDecision = {
  status: "suggested" | "flag";
  flagReason: null | "vendor_unresolved" | "vendor_ambiguous" | "no_history" | "multiple_accounts";
  suggestedAccountId: string | null;
  suggestedAccountName: string | null;
  suggestedTaxCode: string | null;
  ranked: RankedAccount[];
  sampleCount: number;
  /** 0-100 certainty in the suggestion (history depth + account dominance). */
  confidence: number;
  /** Review triage color: green = auto-approve-eligible, yellow = review,
   *  red = must decide (no/ambiguous basis). Caller applies per-client threshold. */
  triage: "green" | "yellow" | "red";
  /** Plain-English "why" for the reviewer (explainability). */
  rationale: string;
};

export type DedupVerdict = {
  isDuplicate: boolean;
  reason: null | "invoice_match" | "amount_date_match";
  matchedTxnId: string | null;
  matchedDocNumber: string | null;
};

export type VendorResolution =
  | { status: "resolved"; vendorId: string; displayName: string }
  | { status: "ambiguous"; candidates: { vendorId: string; displayName: string; score: number }[] }
  | { status: "unresolved" };

/** Normalize a vendor name: lowercase, strip punctuation and common corporate
 *  suffixes, collapse whitespace. */
export function normalizeVendorName(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .replace(/[.,&'"/()]/g, " ")
    .replace(/\b(inc|incorporated|ltd|limited|llc|co|corp|corporation|company|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize an invoice / document number for dedup comparison: uppercase,
 *  strip spaces/dashes/dots/slashes, and drop a leading "INV"/"#"/"NO" prefix.
 *  (Industry best practice — exact match alone misses the majority of dupes
 *  because of trivial formatting variation.) */
export function normalizeInvoiceNumber(raw: string | null | undefined): string {
  return (raw ?? "")
    .toUpperCase()
    .replace(/[\s\-.\/#]/g, "")
    .replace(/^(INVOICE|INV|NO)/, "")
    .trim();
}

/** Jaccard similarity on normalized word sets. */
export function vendorNameSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeVendorName(a).split(" ").filter(Boolean));
  const setB = new Set(normalizeVendorName(b).split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  const inter = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return inter.size / union.size;
}

/** Decide vendor resolution from QBO Vendor candidates. Never guesses when
 *  ambiguous — that surfaces as a FLAG upstream. */
export function resolveVendorFromCandidates(
  rawName: string,
  candidates: { Id: string; DisplayName: string }[],
): VendorResolution {
  if (!candidates || candidates.length === 0) return { status: "unresolved" };
  if (candidates.length === 1) {
    return { status: "resolved", vendorId: candidates[0].Id, displayName: candidates[0].DisplayName };
  }
  const scored = candidates
    .map((c) => ({ vendorId: c.Id, displayName: c.DisplayName, score: vendorNameSimilarity(rawName, c.DisplayName) }))
    .sort((a, b) => b.score - a.score);
  const [top, second] = scored;
  if (top.score >= 0.6 && (!second || top.score - second.score >= 0.34)) {
    return { status: "resolved", vendorId: top.vendorId, displayName: top.displayName };
  }
  return { status: "ambiguous", candidates: scored };
}

/** Parse a `SELECT * FROM Bill WHERE VendorRef=...` response into coding entries. */
export function parseBillHistory(queryResponseBody: any): CodingEntry[] {
  const bills = queryResponseBody?.QueryResponse?.Bill ?? [];
  const out: CodingEntry[] = [];
  for (const bill of bills) {
    for (const line of bill.Line ?? []) {
      const det = line.AccountBasedExpenseLineDetail;
      if (line.DetailType !== "AccountBasedExpenseLineDetail" || !det?.AccountRef) continue;
      out.push({
        accountId: String(det.AccountRef.value),
        accountName: det.AccountRef.name ?? "",
        taxCode: det.TaxCodeRef?.value != null ? String(det.TaxCodeRef.value) : null,
        source: "bill",
        date: String(bill.TxnDate),
        amount: Number(line.Amount ?? bill.TotalAmt ?? 0),
        txnId: String(bill.Id),
        docNumber: bill.DocNumber != null ? String(bill.DocNumber) : null,
      });
    }
  }
  return out;
}

/** Parse a vendor-filtered TransactionList report (`other_account` = expense
 *  side). Skips Bills (covered by SQL) and "-Split-" rows. */
export function parseExpenseReport(reportBody: any): CodingEntry[] {
  const cols: { ColType: string }[] = reportBody?.Columns?.Column ?? [];
  const idx = (t: string) => cols.findIndex((c) => c.ColType === t);
  const iType = idx("txn_type");
  const iDate = idx("tx_date");
  const iDoc = idx("doc_num");
  const iOther = idx("other_account");
  const iAmt = idx("subt_nat_amount");
  if (iOther < 0) return [];

  const rows = reportBody?.Rows?.Row ?? [];
  const out: CodingEntry[] = [];
  for (const row of rows) {
    if (row.type && row.type !== "Data") continue;
    const cd = row.ColData;
    if (!cd) continue;
    const txnType = iType >= 0 ? cd[iType]?.value : "";
    if (txnType === "Bill") continue;
    const acct = cd[iOther];
    if (!acct?.id || !acct.value || acct.value === "-Split-") continue;
    out.push({
      accountId: String(acct.id),
      accountName: String(acct.value),
      taxCode: null,
      source: "expense",
      date: iDate >= 0 ? String(cd[iDate]?.value ?? "") : "",
      amount: Math.abs(Number((iAmt >= 0 ? cd[iAmt]?.value : 0) ?? 0)),
      txnId: cd[iType]?.id != null ? String(cd[iType].id) : "",
      docNumber: iDoc >= 0 && cd[iDoc]?.value ? String(cd[iDoc].value) : null,
    });
  }
  return out;
}

/** The core decision: given a vendor's coding history, pick the account or flag.
 *  0 history -> FLAG. 1 account -> suggest. 2+ -> ALWAYS FLAG w/ ranked list.
 *  Also returns a 0-100 confidence, a triage color, and a plain-English rationale.
 *  `greenThreshold` is the per-client auto-approve-eligible cutoff (default 85). */
export function decideCoding(entries: CodingEntry[], greenThreshold = 85): CodingDecision {
  if (entries.length === 0) {
    return {
      status: "flag", flagReason: "no_history",
      suggestedAccountId: null, suggestedAccountName: null, suggestedTaxCode: null,
      ranked: [], sampleCount: 0, confidence: 0, triage: "red",
      rationale: "No prior transactions for this vendor — needs an account. Chart of accounts is locked; Figgy never guesses.",
    };
  }

  const byAccount = new Map<string, RankedAccount & { taxCounts: Map<string, number> }>();
  for (const e of entries) {
    let r = byAccount.get(e.accountId);
    if (!r) {
      r = { accountId: e.accountId, accountName: e.accountName, taxCode: null, count: 0, lastDate: e.date, totalAmount: 0, taxCounts: new Map() };
      byAccount.set(e.accountId, r);
    }
    r.count += 1;
    r.totalAmount += e.amount;
    if (e.date > r.lastDate) r.lastDate = e.date;
    if (!r.accountName && e.accountName) r.accountName = e.accountName;
    if (e.taxCode) r.taxCounts.set(e.taxCode, (r.taxCounts.get(e.taxCode) ?? 0) + 1);
  }

  const ranked: RankedAccount[] = [...byAccount.values()]
    .map((r) => {
      let taxCode: string | null = null;
      let best = -1;
      for (const [code, n] of r.taxCounts) if (n > best) { best = n; taxCode = code; }
      return { accountId: r.accountId, accountName: r.accountName, taxCode, count: r.count, lastDate: r.lastDate, totalAmount: Math.round(r.totalAmount * 100) / 100 };
    })
    .sort((a, b) => b.count - a.count || (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0) || b.totalAmount - a.totalAmount);

  const sampleCount = entries.length;
  const top = ranked[0];
  const topShare = top.count / sampleCount; // dominance of the leading account

  // 2+ distinct accounts -> ALWAYS FLAG with a ranked breakdown (Markie's rule).
  if (ranked.length >= 2) {
    const confidence = Math.round(topShare * 100);
    const list = ranked.map((r) => `${r.accountName} (${r.count}/${sampleCount})`).join(", ");
    return {
      status: "flag", flagReason: "multiple_accounts",
      suggestedAccountId: top.accountId, suggestedAccountName: top.accountName, suggestedTaxCode: top.taxCode,
      ranked, sampleCount, confidence, triage: "yellow",
      rationale: `This vendor's past transactions used ${ranked.length} different accounts — pick one: ${list}. Most-used: ${top.accountName}.`,
    };
  }

  // Exactly one account in history -> confident suggestion (still human-reviewed).
  // Confidence grows with how much history backs it: 1 sample=70 … 5+=95.
  const confidence = Math.min(99, 60 + Math.min(sampleCount, 5) * 7);
  const triage: CodingDecision["triage"] = confidence >= greenThreshold ? "green" : "yellow";
  const taxClause = top.taxCode ? ` at tax code ${top.taxCode}` : "";
  return {
    status: "suggested", flagReason: null,
    suggestedAccountId: top.accountId, suggestedAccountName: top.accountName, suggestedTaxCode: top.taxCode,
    ranked, sampleCount, confidence, triage,
    rationale: `Coded to ${top.accountName} (${top.accountId})${taxClause} — all ${sampleCount} of this vendor's prior transaction${sampleCount === 1 ? "" : "s"} used it.`,
  };
}

/** Dedup against the vendor's existing transactions. Invoice# is the strongest
 *  key (compared after NORMALIZATION — dashes/spaces/prefixes stripped — since
 *  exact match alone misses most real duplicates); amount+date within tolerance
 *  is the fallback. */
export function decideDedup(
  candidate: { invoiceNumber?: string | null; total?: number | null; txnDate?: string | null },
  existing: { docNumber: string | null; amount: number; date: string; txnId: string }[],
  amountTolerance = 0.01,
  dateToleranceDays = 3,
): DedupVerdict {
  const inv = normalizeInvoiceNumber(candidate.invoiceNumber);
  if (inv) {
    const hit = existing.find((e) => {
      const d = normalizeInvoiceNumber(e.docNumber);
      return d !== "" && d === inv;
    });
    if (hit) return { isDuplicate: true, reason: "invoice_match", matchedTxnId: hit.txnId, matchedDocNumber: hit.docNumber };
  }
  const total = candidate.total ?? null;
  const date = candidate.txnDate ?? null;
  if (total != null && date != null) {
    const cand = new Date(date).getTime();
    const hit = existing.find((e) => {
      if (Math.abs(e.amount - total) > amountTolerance) return false;
      const dd = Math.abs(new Date(e.date).getTime() - cand) / 86_400_000;
      return dd <= dateToleranceDays;
    });
    if (hit) return { isDuplicate: true, reason: "amount_date_match", matchedTxnId: hit.txnId, matchedDocNumber: hit.docNumber };
  }
  return { isDuplicate: false, reason: null, matchedTxnId: null, matchedDocNumber: null };
}
