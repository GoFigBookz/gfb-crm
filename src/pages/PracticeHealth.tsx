import { useState } from "react";
import { Lock, Users, Clock, Receipt, ArrowUpRight, Building2, Wallet, ListChecks, Briefcase, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";

export default function PracticeHealth() {
  const [activeTab, setActiveTab] = useState("overview");
  const [firmId, setFirmId] = useState<number | undefined>(undefined);
  const { data, isLoading } = trpc.practiceHealth.summary.useQuery({ firmId });

  const roster = data?.roster;
  const revenue = data?.revenue;
  const payroll = data?.payrollProcessed;
  const billing = data?.billing;
  const firm = data?.firm;
  const firms = data?.firms ?? [];

  // Currency follows the firm — Go Fig Bookz USA's books are in USD, the Canadian
  // firm's in CAD. (The numbers are the firm's own ledger amounts in its own currency;
  // we don't FX-convert, just label correctly.)
  const cur = (firm?.country || "CA") === "US" ? { locale: "en-US", code: "USD" } : { locale: "en-CA", code: "CAD" };
  const money = (n: number) => (n || 0).toLocaleString(cur.locale, { style: "currency", currency: cur.code, maximumFractionDigits: 0 });
  const money2 = (n: number) => (n || 0).toLocaleString(cur.locale, { style: "currency", currency: cur.code, minimumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Lock className="h-6 w-6 text-lime-500" />
            Practice Health
          </h1>
          <p className="text-slate-500">
            Owner-only view of firm performance{firm ? <> — anchored on <span className="font-medium text-slate-700">{firm.name}</span> <span className="text-xs font-medium text-slate-400">({cur.code})</span></> : null}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {firms.length > 1 && (
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5">
              {firms.map((f) => {
                const selected = (firm?.id ?? firms[0].id) === f.id;
                return (
                  <button key={f.id} onClick={() => setFirmId(f.id)}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium ${selected ? "bg-lime-100 text-lime-700" : "text-slate-500 hover:text-slate-700"}`}>
                    {f.name} <span className="opacity-60">{f.country}</span>
                  </button>
                );
              })}
            </div>
          )}
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            <Lock className="h-3 w-3 mr-1" /> Admin Only
          </Badge>
        </div>
      </div>

      {!firm && !isLoading && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>No firm self-client is flagged yet. Visit <code className="px-1 rounded bg-amber-100">/api/firm/seed</code> to tag Go Fig Bookz — once flagged, its own QBO books drive billed-vs-collected here.</span>
        </div>
      )}

      {/* Top stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={Wallet} label="Recurring revenue (MRR)" value={revenue ? money(revenue.mrr) : "—"}
          sub={revenue ? `${money(revenue.annualized)} annualized` : ""} accent />
        <Stat icon={Users} label="Active clients" value={roster ? String(roster.active) : "—"}
          sub={roster ? `${roster.total} total · ${roster.newThisMonth} new this month` : ""} />
        <Stat icon={Briefcase} label={`${payroll?.year ?? ""} payroll processed`} value={payroll ? money(payroll.ytdGross) : "—"}
          sub={payroll ? `${payroll.runs} runs · ${payroll.clients} clients` : ""} />
        <Stat icon={Receipt} label="Outstanding (firm)" value={billing ? money(billing.outstanding) : "—"}
          sub={billing ? `${billing.collectionRate}% collected` : "Connect QBO for billing"} amber={!!billing} />
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="clients">Client revenue</TabsTrigger>
          <TabsTrigger value="billing">Billed vs collected</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Client stats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-lime-500" /> Client roster</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Row label="Total clients" value={roster?.total} />
                <Row label="Active" value={roster?.active} green />
                <Row label="Prospects / leads" value={(roster?.prospect ?? 0) + (roster?.lead ?? 0)} />
                <Row label="Inactive / churned" value={(roster?.inactive ?? 0) + (roster?.churned ?? 0)} red />
                <Row label="New this month" value={roster?.newThisMonth} />
                <Row label="On HST" value={roster?.hstClients} />
                <Row label="We run payroll" value={roster?.payrollClients} />
              </CardContent>
            </Card>

            {/* Revenue */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4 text-lime-500" /> Recurring revenue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Row label="MRR" value={revenue ? money2(revenue.mrr) : "—"} green />
                <Row label="Annualized" value={revenue ? money2(revenue.annualized) : "—"} />
                <Row label="Avg fee / active client" value={revenue ? money2(revenue.avgFee) : "—"} />
                <Row label="Clients with a fee set" value={revenue?.clientsWithFee} />
                {!!revenue?.clientsMissingFee && (
                  <div className="flex items-start gap-1.5 text-xs text-amber-600 pt-1">
                    <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
                    {revenue.clientsMissingFee} active client{revenue.clientsMissingFee === 1 ? "" : "s"} missing a monthly fee — set it on the client card to count toward MRR.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payroll throughput */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4 text-lime-500" /> Payroll processed</CardTitle>
                <CardDescription className="text-xs">Gross run across the whole book this year.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Row label={`${payroll?.year ?? "YTD"} gross`} value={payroll ? money2(payroll.ytdGross) : "—"} green />
                <Row label="Pay runs" value={payroll?.runs} />
                <Row label="Clients with payroll" value={payroll?.clients} />
              </CardContent>
            </Card>
          </div>

          {/* Client mix */}
          {roster && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Active client mix</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {([
                    ["Monthly", roster.byType.monthly],
                    ["Quarterly", roster.byType.quarterly],
                    ["Annual", roster.byType.annual],
                    ["Payroll", roster.byType.payroll],
                    ["Wholesale", roster.byType.wholesale],
                  ] as [string, number][]).map(([label, n]) => (
                    <div key={label} className="p-3 rounded-lg bg-slate-50 text-center">
                      <p className="text-xl font-bold">{n}</p>
                      <p className="text-xs text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="clients" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Client revenue</CardTitle>
              <CardDescription>Active clients ranked by monthly fee. Payroll processed shown alongside as a work-volume read.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-slate-500 border-b">
                    <th className="text-left py-2 pr-2">Client</th>
                    <th className="text-left px-2">Type</th>
                    <th className="text-right px-2">Monthly fee</th>
                    <th className="text-right px-2">YTD payroll</th>
                    <th className="text-right px-2">Open tasks</th>
                  </tr></thead>
                  <tbody>
                    {(data?.topClients || []).map((c) => (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-2 pr-2 font-medium"><Link to={`/client/${c.id}`} className="hover:text-lime-700">{c.name}</Link></td>
                        <td className="px-2 text-slate-500">{c.clientType || "—"}</td>
                        <td className="px-2 text-right font-medium">{c.monthlyFee ? money2(c.monthlyFee) : "—"}</td>
                        <td className="px-2 text-right">{c.ytdPayroll ? money(c.ytdPayroll) : "—"}</td>
                        <td className="px-2 text-right">{c.openTasks ? <Badge variant="outline">{c.openTasks}</Badge> : "—"}</td>
                      </tr>
                    ))}
                    {data && !data.topClients.length && (
                      <tr><td colSpan={5} className="py-6 text-center text-slate-400">No active clients yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {revenue && !revenue.clientsWithFee && (
                <p className="text-[11px] text-amber-600 mt-3">No monthly fees are set yet — add a fee on each client card to populate revenue here.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          {billing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-lime-500" /> Billed vs collected</CardTitle>
                  <CardDescription className="text-xs">From {firm?.name}'s own QBO invoices this year.</CardDescription></CardHeader>
                <CardContent className="space-y-2">
                  <Row label="Invoiced" value={money2(billing.invoiced)} />
                  <Row label="Collected" value={money2(billing.collected)} green />
                  <Row label="Outstanding" value={money2(billing.outstanding)} amber />
                  <div className="pt-1">
                    <div className="flex justify-between text-xs mb-1"><span className="text-slate-500">Collection rate</span><span className="font-medium">{billing.collectionRate}%</span></div>
                    <Progress value={billing.collectionRate} className="h-2" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-lime-500" /> A/R aging</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Row label="0–30 days" value={money2(billing.aging30)} />
                  <Row label="31–60 days" value={money2(billing.aging60)} amber />
                  <Row label="60+ days" value={money2(billing.aging90)} red />
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-slate-400">
                <Building2 className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p>Billed-vs-collected pulls from {firm ? `${firm.name}'s` : "the firm's"} own QBO invoices.</p>
                <p className="text-sm mt-1">{firm ? (firm.qboConnected ? "No invoices found yet for this year." : "Connect the firm's QuickBooks to light this up.") : "Flag the firm self-client first (/api/firm/seed)."}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, accent, amber }: { icon: any; label: string; value: string; sub?: string; accent?: boolean; amber?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-slate-500 mb-1"><Icon className="h-3.5 w-3.5" /><span className="text-[11px] uppercase font-semibold tracking-wide">{label}</span></div>
        <p className={`text-2xl font-bold ${accent ? "text-lime-700" : amber ? "text-amber-600" : ""}`}>{value}</p>
        {sub ? <p className="text-xs text-slate-400 mt-1">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, green, red, amber }: { label: string; value: number | string | undefined; green?: boolean; red?: boolean; amber?: boolean }) {
  const display = value === undefined || value === null ? "—" : typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div className="flex justify-between p-2 bg-slate-50 rounded">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`font-medium ${green ? "text-lime-600" : red ? "text-red-600" : amber ? "text-amber-600" : ""}`}>{display}</span>
    </div>
  );
}
