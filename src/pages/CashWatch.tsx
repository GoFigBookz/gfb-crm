import { Wallet, RefreshCw, TriangleAlert, CheckCircle2, ArrowDownToLine, WifiOff } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";

const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const RISK: Record<string, { dot: string; ring: string; label: string }> = {
  red: { dot: "bg-red-500", ring: "border-red-200 bg-red-50", label: "Needs cash" },
  amber: { dot: "bg-amber-500", ring: "border-amber-200 bg-amber-50", label: "Watch" },
  green: { dot: "bg-emerald-500", ring: "border-emerald-200 bg-emerald-50", label: "OK" },
};

export default function CashWatch() {
  const watch = trpc.clientDashboard.cashWatch.useQuery(undefined, { refetchOnWindowFocus: false });
  const data = watch.data;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-100"><Wallet className="w-6 h-6 text-slate-700" /></div>
          <div>
            <h1 className="text-xl font-semibold">Cash Watch</h1>
            <p className="text-sm text-muted-foreground">Who's low, who can't cover payroll, whose bank feed went quiet — from QuickBooks.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => watch.refetch()} disabled={watch.isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${watch.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {watch.isLoading && <div className="text-sm text-muted-foreground">Loading cash positions…</div>}
      {watch.error && (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">Couldn't load: {watch.error.message}</div>
      )}

      {data && data.clients.length === 0 && (
        <div className="p-6 rounded-lg border bg-slate-50 text-sm text-muted-foreground">
          No cash snapshots yet. They populate from the daily QuickBooks sync (or hit <code>/api/qbo/sync-now</code>). Snapshots only appear for clients with an active QBO connection.
        </div>
      )}

      {data && data.clients.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Clients tracked" value={String(data.summary.total)} />
            <Stat label="Can't cover payroll" value={String(data.summary.cantCoverPayroll)} danger={data.summary.cantCoverPayroll > 0} />
            <Stat label="Stale bank feeds" value={String(data.summary.staleFeeds)} warn={data.summary.staleFeeds > 0} />
            <Stat label="Total CAD cash" value={money(data.summary.totalCadCash)} />
          </div>

          <div className="space-y-3">
            {data.clients.map((c: any) => {
              const meta = RISK[c.risk] ?? RISK.green;
              return (
                <div key={c.clientId} className={`rounded-lg border p-4 ${meta.ring}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full ${meta.dot} shrink-0`} />
                      <Link to={`/client/${c.clientId}`} className="font-medium truncate hover:underline">{c.clientName}</Link>
                      <span className="text-xs text-muted-foreground shrink-0">· {meta.label}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold">{money(c.cashCad)}<span className="text-xs font-normal text-muted-foreground"> CAD cash</span></div>
                      {c.cashUsd ? <div className="text-xs text-muted-foreground">+ {(c.cashUsd ?? 0).toLocaleString("en-CA", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} USD</div> : null}
                    </div>
                  </div>

                  {/* Headline alerts */}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.coversPayroll === false && (
                      <Pill icon={ArrowDownToLine} tone="red">
                        Transfer {money(c.payrollShortfall)} — payroll {money(c.upcomingPayrollAmount)} &gt; cash
                      </Pill>
                    )}
                    {(c.staleAccounts?.length > 0 || (c.staleFeedDays != null && c.staleFeedDays >= 14)) && (
                      <Pill icon={WifiOff} tone="amber">
                        {c.staleAccounts?.length ? `Feed quiet: ${c.staleAccounts.join(", ")}` : `No bank activity ${c.staleFeedDays}d`}
                      </Pill>
                    )}
                    {c.uncategorizedCount > 0 && (
                      <Pill icon={TriangleAlert} tone="slate">{c.uncategorizedCount} uncategorized to post</Pill>
                    )}
                    {c.coversPayroll === true && (
                      <Pill icon={CheckCircle2} tone="green">Covers payroll {money(c.upcomingPayrollAmount)}</Pill>
                    )}
                  </div>

                  {/* Money in / out */}
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    <Mini label="AR (in)" value={money(c.arOutstanding)} />
                    <Mini label="AP (out)" value={money(c.apOutstanding)} />
                    <Mini label="Credit card" value={money(c.creditCardOwed)} />
                    <Mini label="Accounts" value={String(c.bankAccounts?.length ?? 0)} />
                  </div>

                  {/* Per-account detail */}
                  {c.bankAccounts?.length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                      {c.bankAccounts.map((b: any, i: number) => (
                        <span key={i} className={b.staleDays != null && b.staleDays >= 14 ? "text-amber-700" : ""}>
                          {b.name}: {money(b.balance)} {b.currency}{b.staleDays != null ? ` · ${b.staleDays}d` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, danger, warn }: { label: string; value: string; danger?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${danger ? "border-red-200 bg-red-50" : warn ? "border-amber-200 bg-amber-50" : "bg-white"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded bg-white/60 border px-2 py-1"><div className="text-[11px] text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>;
}
function Pill({ icon: Icon, tone, children }: { icon: any; tone: "red" | "amber" | "green" | "slate"; children: React.ReactNode }) {
  const tones = { red: "bg-red-100 text-red-800", amber: "bg-amber-100 text-amber-800", green: "bg-emerald-100 text-emerald-800", slate: "bg-slate-100 text-slate-700" };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}><Icon className="w-3.5 h-3.5" />{children}</span>;
}
