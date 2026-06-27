/**
 * CHART OF ACCOUNTS CLEANUP TOOL (Markie's COA review workflow).
 * =============================================================================
 * Four read-only jobs over a client's QBO chart of accounts:
 *   1. EXPORT   — pull the full chart → table + download CSV (clean it up externally
 *                 in Sheets/Excel + AI, then apply the few real changes by hand).
 *   2. COMPARE  — diff two clients so they "marry" (Clark OS ↔ CW: same numbers/names).
 *   3. TEMPLATE — gap vs a standard chart for the business TYPE (construction/trades…).
 *   4. TIE-OUT  — reconcile QBO balances to the accountant's pasted trial balance
 *                 (the gate Markie wants BEFORE any cleanup).
 *
 * The chart of accounts is LOCKED — this tool EXPORTS + COMPARES + CHECKS. It never
 * edits QBO accounts (QBO has no safe bulk rewrite; the human applies the few changes).
 * =============================================================================
 */
import { useState, useMemo } from "react";
import { ListTree, Download, GitCompare, ClipboardCheck, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import HelpButton from "@/components/HelpButton";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";

const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });

function ClientPicker({ value, onChange, label, clients }: { value: string; onChange: (v: string) => void; label: string; clients: any[] }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Select a client…" /></SelectTrigger>
        <SelectContent>
          {clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

const ErrPill = ({ error }: { error: string }) => {
  const friendly: Record<string, string> = {
    no_active_connection: "This client isn't connected to QuickBooks yet.",
    ambiguous_connection: "This client has more than one QBO connection — can't pick one safely.",
    bridge_not_returning_data: "QuickBooks didn't return data (the Make bridge is still acking instead of replying).",
    unknown_template: "That template isn't defined.",
    no_tb_lines_parsed: "Couldn't read any balances from the pasted trial balance.",
  };
  return (
    <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <span>{friendly[error] || error}</span>
    </div>
  );
};

export default function ChartOfAccounts() {
  const { data: clients } = trpc.crmClient.list.useQuery({ status: "all", limit: 200 });
  const clientList = (clients ?? []) as any[];

  // ---- Export ----
  const [exportClient, setExportClient] = useState("");
  const exportM = trpc.coa.exportChart.useMutation();

  function downloadCsv(csv: string, name: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${name.replace(/[^a-z0-9]+/gi, "-")}-chart-of-accounts.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ---- Compare ----
  const [cmpA, setCmpA] = useState(""); const [cmpB, setCmpB] = useState("");
  const compareM = trpc.coa.compareCharts.useMutation();

  // ---- Template ----
  const { data: templates } = trpc.coa.templates.useQuery();
  const [tplClient, setTplClient] = useState(""); const [tplKey, setTplKey] = useState("");
  const templateM = trpc.coa.compareToTemplate.useMutation();

  // ---- Reconcile ----
  const [tbClient, setTbClient] = useState(""); const [tbText, setTbText] = useState("");
  const reconcileM = trpc.coa.reconcileTb.useMutation();

  const issueBadge = (issue: string) => {
    const map: Record<string, [string, string]> = {
      number_differs: ["bg-orange-100 text-orange-700", "same name, different #"],
      name_differs: ["bg-amber-100 text-amber-700", "same #, different name"],
      type_differs: ["bg-yellow-100 text-yellow-700", "different type"],
      only_a: ["bg-blue-100 text-blue-700", "only in A"],
      only_b: ["bg-violet-100 text-violet-700", "only in B"],
      match: ["bg-green-100 text-green-700", "match"],
    };
    const [cls, label] = map[issue] || ["bg-slate-100 text-slate-600", issue];
    return <Badge className={cn("font-normal", cls)} variant="secondary">{label}</Badge>;
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-lime-100 flex items-center justify-center"><ListTree className="h-6 w-6 text-lime-700" /></div>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">Chart of Accounts Cleanup <HelpButton id="coa-cleanup" /></h1>
          <p className="text-sm text-slate-500">Export · compare · tie out to the trial balance. Read-only — the chart stays locked; you apply the cleaned changes by hand.</p>
        </div>
      </div>

      <Tabs defaultValue="export">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="export"><Download className="h-4 w-4 mr-1.5" />Export</TabsTrigger>
          <TabsTrigger value="compare"><GitCompare className="h-4 w-4 mr-1.5" />Compare 2</TabsTrigger>
          <TabsTrigger value="template"><FileSpreadsheet className="h-4 w-4 mr-1.5" />Template</TabsTrigger>
          <TabsTrigger value="reconcile"><ClipboardCheck className="h-4 w-4 mr-1.5" />Tie-out</TabsTrigger>
        </TabsList>

        {/* ===== EXPORT ===== */}
        <TabsContent value="export" className="space-y-3 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Export a client's chart</CardTitle>
              <CardDescription>Pull the full chart of accounts, then download the CSV to clean up in Sheets/Excel with AI. Apply the few real changes back in QBO by hand (the chart is locked — nothing here writes to QuickBooks).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1"><ClientPicker label="Client" value={exportClient} onChange={setExportClient} clients={clientList} /></div>
                <Button disabled={!exportClient || exportM.isPending} onClick={() => exportM.mutate({ clientId: Number(exportClient) })}>
                  {exportM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}Pull chart
                </Button>
              </div>
              {exportM.data && !exportM.data.ok && <ErrPill error={exportM.data.error} />}
              {exportM.data?.ok && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-600">{exportM.data.count} accounts for <b>{exportM.data.clientName}</b></p>
                    <Button size="sm" variant="outline" onClick={() => downloadCsv(exportM.data!.csv, exportM.data!.clientName)}><Download className="h-4 w-4 mr-1.5" />Download CSV</Button>
                  </div>
                  <div className="border rounded-lg overflow-hidden max-h-[28rem] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0"><tr><th className="text-left p-2">#</th><th className="text-left p-2">Name</th><th className="text-left p-2">Type</th><th className="text-right p-2">Balance</th></tr></thead>
                      <tbody>
                        {exportM.data.rows.map((r, i) => (
                          <tr key={i} className={cn("border-t", r.active === false && "opacity-50")}>
                            <td className="p-2 font-mono text-xs">{r.num || "—"}</td>
                            <td className="p-2">{r.name}{r.active === false && <span className="text-xs text-slate-400 ml-1">(inactive)</span>}</td>
                            <td className="p-2 text-slate-500">{r.type}{r.subType ? ` · ${r.subType}` : ""}</td>
                            <td className="p-2 text-right font-mono">{money(r.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== COMPARE TWO ===== */}
        <TabsContent value="compare" className="space-y-3 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Marry two charts</CardTitle>
              <CardDescription>Compare two clients so their charts line up (e.g. Clark Pools Owen Sound ↔ Collingwood — same account numbers, same names). Matched on account number, then name.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <ClientPicker label="Chart A" value={cmpA} onChange={setCmpA} clients={clientList} />
                <ClientPicker label="Chart B" value={cmpB} onChange={setCmpB} clients={clientList} />
              </div>
              <Button disabled={!cmpA || !cmpB || cmpA === cmpB || compareM.isPending} onClick={() => compareM.mutate({ clientIdA: Number(cmpA), clientIdB: Number(cmpB) })}>
                {compareM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <GitCompare className="h-4 w-4 mr-1.5" />}Compare
              </Button>
              {compareM.data && !compareM.data.ok && <ErrPill error={compareM.data.error} />}
              {compareM.data?.ok && (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary" className="bg-green-100 text-green-700">{compareM.data.summary.match} match</Badge>
                    <Badge variant="secondary" className="bg-orange-100 text-orange-700">{compareM.data.summary.mismatches} to align</Badge>
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">{compareM.data.summary.onlyA} only in {compareM.data.nameA}</Badge>
                    <Badge variant="secondary" className="bg-violet-100 text-violet-700">{compareM.data.summary.onlyB} only in {compareM.data.nameB}</Badge>
                  </div>
                  <div className="border rounded-lg overflow-hidden max-h-[28rem] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0"><tr><th className="text-left p-2">Issue</th><th className="text-left p-2">{compareM.data.nameA}</th><th className="text-left p-2">{compareM.data.nameB}</th></tr></thead>
                      <tbody>
                        {compareM.data.entries.filter((e) => e.issue !== "match").map((e, i) => (
                          <tr key={i} className="border-t align-top">
                            <td className="p-2">{issueBadge(e.issue)}</td>
                            <td className="p-2">{e.a ? <span><span className="font-mono text-xs">{e.a.num || "—"}</span> {e.a.name} <span className="text-slate-400 text-xs">({e.a.type})</span></span> : <span className="text-slate-300">—</span>}</td>
                            <td className="p-2">{e.b ? <span><span className="font-mono text-xs">{e.b.num || "—"}</span> {e.b.name} <span className="text-slate-400 text-xs">({e.b.type})</span></span> : <span className="text-slate-300">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TEMPLATE ===== */}
        <TabsContent value="template" className="space-y-3 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compare to a standard chart</CardTitle>
              <CardDescription>See what a client is missing (or has extra) vs a standard chart for their business type, so all clients of the same type look alike.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <ClientPicker label="Client" value={tplClient} onChange={setTplClient} clients={clientList} />
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Business type</label>
                  <Select value={tplKey} onValueChange={setTplKey}>
                    <SelectTrigger><SelectValue placeholder="Select a template…" /></SelectTrigger>
                    <SelectContent>{(templates ?? []).map((t) => <SelectItem key={t.key} value={t.key}>{t.label} ({t.count} accounts)</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button disabled={!tplClient || !tplKey || templateM.isPending} onClick={() => templateM.mutate({ clientId: Number(tplClient), templateKey: tplKey })}>
                {templateM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5" />}Check gap
              </Button>
              {templateM.data && !templateM.data.ok && <ErrPill error={templateM.data.error} />}
              {templateM.data?.ok && (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary" className="bg-green-100 text-green-700">{templateM.data.summary.match} already match</Badge>
                    <Badge variant="secondary" className="bg-violet-100 text-violet-700">{templateM.data.summary.missingFromChart} missing vs standard</Badge>
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">{templateM.data.summary.extraInChart} extra</Badge>
                  </div>
                  <div className="border rounded-lg overflow-hidden max-h-[28rem] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0"><tr><th className="text-left p-2">Status</th><th className="text-left p-2">{templateM.data.clientName}</th><th className="text-left p-2">Standard</th></tr></thead>
                      <tbody>
                        {templateM.data.entries.filter((e) => e.issue !== "match").map((e, i) => (
                          <tr key={i} className="border-t align-top">
                            <td className="p-2">{e.issue === "only_b" ? <Badge variant="secondary" className="bg-violet-100 text-violet-700 font-normal">missing</Badge> : e.issue === "only_a" ? <Badge variant="secondary" className="bg-blue-100 text-blue-700 font-normal">extra</Badge> : issueBadge(e.issue)}</td>
                            <td className="p-2">{e.a ? <span><span className="font-mono text-xs">{e.a.num || "—"}</span> {e.a.name}</span> : <span className="text-slate-300">—</span>}</td>
                            <td className="p-2">{e.b ? <span><span className="font-mono text-xs">{e.b.num || "—"}</span> {e.b.name} <span className="text-slate-400 text-xs">({e.b.type})</span></span> : <span className="text-slate-300">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== RECONCILE / TIE-OUT ===== */}
        <TabsContent value="reconcile" className="space-y-3 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tie out to the accountant's trial balance</CardTitle>
              <CardDescription>Paste the accountant's trial balance, and we'll check every QBO balance ties before you clean anything up. This is the gate — clean the chart only once the numbers match.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ClientPicker label="Client" value={tbClient} onChange={setTbClient} clients={clientList} />
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Trial balance (paste rows: <span className="font-mono">number  name  balance</span> — tabs, commas, $ and (parens) all OK)</label>
                <Textarea value={tbText} onChange={(e) => setTbText(e.target.value)} rows={6} placeholder={"1000  Chequing  5,000.00\n1500  Accounts Receivable  12,345.67\n3000  Retained Earnings  (2,300.00)"} className="font-mono text-xs" />
              </div>
              <Button disabled={!tbClient || !tbText.trim() || reconcileM.isPending} onClick={() => reconcileM.mutate({ clientId: Number(tbClient), trialBalance: tbText })}>
                {reconcileM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ClipboardCheck className="h-4 w-4 mr-1.5" />}Tie out
              </Button>
              {reconcileM.data && !reconcileM.data.ok && <ErrPill error={reconcileM.data.error} />}
              {reconcileM.data?.ok && (
                <>
                  <div className={cn("flex items-center gap-2 text-sm rounded-lg p-3 border", reconcileM.data.tied ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700")}>
                    {reconcileM.data.tied ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    {reconcileM.data.tied ? `Tied — all ${reconcileM.data.parsedLines} balances match. Safe to clean up.` : `${reconcileM.data.mismatches} line(s) don't tie. Resolve these before cleanup.`}
                  </div>
                  <div className="border rounded-lg overflow-hidden max-h-[28rem] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0"><tr><th className="text-left p-2">Account</th><th className="text-right p-2">QBO</th><th className="text-right p-2">Trial bal.</th><th className="text-right p-2">Diff</th></tr></thead>
                      <tbody>
                        {reconcileM.data.entries.map((e, i) => (
                          <tr key={i} className={cn("border-t", e.status === "differs" && "bg-amber-50", (e.status === "only_qbo" || e.status === "only_tb") && "bg-slate-50")}>
                            <td className="p-2"><span className="font-mono text-xs">{e.num || "—"}</span> {e.name}{e.status === "only_qbo" && <span className="text-xs text-blue-600 ml-1">(not in TB)</span>}{e.status === "only_tb" && <span className="text-xs text-violet-600 ml-1">(not in QBO)</span>}</td>
                            <td className="p-2 text-right font-mono">{money(e.qbo)}</td>
                            <td className="p-2 text-right font-mono">{money(e.tb)}</td>
                            <td className={cn("p-2 text-right font-mono", e.status === "match" ? "text-green-600" : "text-amber-700 font-semibold")}>{e.status === "match" ? "✓" : money(e.diff)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
