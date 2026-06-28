/**
 * MONEY FORMATTING — currency follows the entity's country.
 * US clients / the Go Fig Bookz USA firm keep their books in USD; everyone else CAD.
 * We don't FX-convert — these are ledger amounts shown in the entity's own currency,
 * just labelled correctly. Pass the client/firm `country` (or qboAccountType) so a US
 * entity's dollars read as USD instead of CAD.
 */
export function currencyForCountry(country?: string | null, qboAccountType?: string | null): { locale: string; code: "USD" | "CAD" } {
  const isUS = (country || "").toUpperCase() === "US" || qboAccountType === "us_clients";
  return isUS ? { locale: "en-US", code: "USD" } : { locale: "en-CA", code: "CAD" };
}

/** Format a number as currency in the entity's own currency (USD for US, else CAD). */
export function fmtMoney(
  n: number | null | undefined,
  opts?: { country?: string | null; qboAccountType?: string | null; decimals?: number; dash?: boolean },
): string {
  if (n == null && opts?.dash) return "—";
  const c = currencyForCountry(opts?.country, opts?.qboAccountType);
  return (n || 0).toLocaleString(c.locale, {
    style: "currency",
    currency: c.code,
    ...(opts?.decimals != null ? { minimumFractionDigits: opts.decimals, maximumFractionDigits: opts.decimals } : {}),
  });
}
