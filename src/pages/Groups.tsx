import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Building2, Users, Wallet, ListChecks, ArrowRightLeft, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";

const money = (n: number) => (n || 0).toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 });

export default function Groups() {
  const { data: groups } = trpc.group.list.useQuery();
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => { if (!active && groups && groups.length) setActive(groups[0].name); }, [groups, active]);

  const { data: roll } = trpc.group.rollup.useQuery({ groupName: active || "" }, { enabled: !!active });
  const t = roll?.totals;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Building2 className="h-7 w-7 text-lime-500" />
        <div>
          <h1 className="text-2xl font-bold">Company Groups</h1>
          <p className="text-sm text-slate-500">Consolidated view across related entities — totals, headcount, and inter-company position.</p>
        </div>
      </div>

      {/* Group picker */}
      <div className="flex flex-wrap gap-2">
        {(groups || []).map((g) => (
          <button key={g.name} onClick={() => setActive(g.name)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${active === g.name ? "bg-lime-500 text-white border-lime-500" : "bg-white hover:bg-slate-50 border-slate-200"}`}>
            {g.name} <span className="opacity-60">({g.count})</span>
          </button>
        ))}
        {groups && !groups.length && <p className="text-sm text-slate-400">No groups yet — set a Group on a client card to start one.</p>}
      </div>

      {/* Group totals */}
      {t && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat icon={Building2} label="Companies" value={String(t.companies)} />
          <Stat icon={Users} label="Employees" value={String(t.employees)} />
          <Stat icon={Wallet} label={`${roll?.year} payroll gross`} value={money(t.ytdPayroll)} accent />
          <Stat icon={ListChecks} label="Open tasks" value={String(t.openTasks)} />
          <Stat icon={ArrowRightLeft} label="Interco moving" value={money(t.intercoOutstanding)} />
        </div>
      )}

      {/* Per-company table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{active || "—"} · companies</CardTitle>
          <CardDescription>Year-to-date figures from the CRM. Net interco: + means others owe this entity, − means it owes the group.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-500 border-b">
                <th className="text-left py-2 pr-2">Company</th>
                <th className="text-left px-2">Type</th>
                <th className="text-center px-2">FYE</th>
                <th className="text-right px-2">Employees</th>
                <th className="text-right px-2">Pay runs</th>
                <th className="text-right px-2">YTD payroll</th>
                <th className="text-right px-2">Open tasks</th>
                <th className="text-right px-2">Net interco</th>
                <th></th>
              </tr></thead>
              <tbody>
                {(roll?.companies || []).map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-2 pr-2 font-medium">
                      <Link to={`/client/${c.id}`} className="hover:text-lime-700">{c.name}</Link>
                    </td>
                    <td className="px-2 text-slate-500">{c.clientType || "—"}</td>
                    <td className="px-2 text-center text-slate-500">{c.yearEndMonth || "—"}</td>
                    <td className="px-2 text-right">{c.employees || "—"}</td>
                    <td className="px-2 text-right">{c.payRuns || "—"}</td>
                    <td className="px-2 text-right font-medium">{c.ytdPayroll ? money(c.ytdPayroll) : "—"}</td>
                    <td className="px-2 text-right">{c.openTasks ? <Badge variant="outline">{c.openTasks}</Badge> : "—"}</td>
                    <td className={`px-2 text-right tabular-nums ${c.intercoNet > 0 ? "text-emerald-600" : c.intercoNet < 0 ? "text-red-600" : "text-slate-400"}`}>
                      {c.intercoNet ? money(c.intercoNet) : "—"}
                    </td>
                    <td className="px-2 text-right"><Link to={`/client/${c.id}`}><ExternalLink className="h-3.5 w-3.5 text-slate-400 inline" /></Link></td>
                  </tr>
                ))}
                {roll && !roll.companies.length && (
                  <tr><td colSpan={9} className="py-6 text-center text-slate-400">No companies in this group yet.</td></tr>
                )}
              </tbody>
              {t && (
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2 pr-2">Total · {t.companies} companies</td>
                    <td></td><td></td>
                    <td className="px-2 text-right">{t.employees}</td>
                    <td className="px-2 text-right">{t.payRuns}</td>
                    <td className="px-2 text-right text-lime-700">{money(t.ytdPayroll)}</td>
                    <td className="px-2 text-right">{t.openTasks}</td>
                    <td className={`px-2 text-right ${Math.abs(t.intercoNetCheck) < 0.01 ? "text-emerald-600" : "text-amber-600"}`}>{money(t.intercoNetCheck)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {t && Math.abs(t.intercoNetCheck) >= 0.01 && (
            <p className="text-[11px] text-amber-600 mt-2">Group interco doesn't net to zero ({money(t.intercoNetCheck)}) — there are unmatched bill-backs to reconcile (Phase 2).</p>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-slate-400">Phase 1: consolidated totals. Next: interco reconciliation + suggested settlement transfers, the family-benefit tracker, and a share link.</p>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-slate-500 mb-1"><Icon className="h-3.5 w-3.5" /><span className="text-[11px] uppercase font-semibold tracking-wide">{label}</span></div>
        <p className={`text-xl font-bold ${accent ? "text-lime-700" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
