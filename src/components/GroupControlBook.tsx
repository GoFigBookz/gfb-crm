import { useState } from "react";
import { Link } from "react-router";
import { BookOpen, ShieldCheck, Coins, Users, Building2, Share2, Check, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";

const money = (n: number) => (n || 0).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`);

/**
 * Staff card: fetches the control book + offers a read-only owner share link.
 * Renders the shared presentational view below.
 */
export function GroupControlBook({ groupName }: { groupName: string }) {
  const { data: groups } = trpc.groupBook.groups.useQuery();
  const hasBook = (groups || []).some((g) => g.name === groupName);
  const [fy, setFy] = useState<string | undefined>(undefined);
  const { data } = trpc.groupBook.get.useQuery({ groupName, fiscalYear: fy }, { enabled: hasBook });

  const utils = trpc.useUtils();
  const { data: links } = trpc.groupBook.shareList.useQuery({ groupName }, { enabled: hasBook });
  const create = trpc.groupBook.shareCreate.useMutation({ onSuccess: () => utils.groupBook.shareList.invalidate({ groupName }) });
  const revoke = trpc.groupBook.shareRevoke.useMutation({ onSuccess: () => utils.groupBook.shareList.invalidate({ groupName }) });
  const [copied, setCopied] = useState(false);

  if (!hasBook || !data) return null;

  const active = (links || []).find((l: any) => l.active);
  const shareUrl = active ? `${window.location.origin}/share/group/${active.token}` : null;
  const copy = () => { if (shareUrl) { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } };

  return (
    <Card className="border-indigo-200">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-5 w-5 text-indigo-500" /> Control Book — {groupName}
              <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-200">Work in progress</Badge>
            </CardTitle>
            <CardDescription>Recreated from the owner's master sheet — entities, cap table, dividends by person, family benefit, and a significant-control register. Read-only; nothing posts.</CardDescription>
          </div>
          <div className="shrink-0 text-right">
            {shareUrl ? (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" onClick={copy} className="text-xs">
                  {copied ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {copied ? "Copied" : "Copy owner link"}
                </Button>
                <Button size="sm" variant="ghost" className="text-xs text-slate-400" onClick={() => active && revoke.mutate({ id: active.id })}>Revoke</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="text-xs" disabled={create.isPending} onClick={() => create.mutate({ groupName, label: `${groupName} — owner view` })}>
                <Share2 className="h-3.5 w-3.5 mr-1" /> {create.isPending ? "Creating…" : "Share with owner"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <GroupControlBookView data={data} onFiscalYear={setFy} />
      </CardContent>
    </Card>
  );
}

/** Presentational view — used by the staff card and the public share page. */
export function GroupControlBookView({ data, onFiscalYear }: { data: any; onFiscalYear?: (fy: string) => void }) {
  return (
    <div className="space-y-6">
      {/* Entities */}
      <Section icon={Building2} title={`Entities (${data.entities.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-500 border-b">
              <th className="text-left py-1.5 pr-2">Company</th>
              <th className="text-left px-2">Operating / brands</th>
              <th className="text-left px-2">Incorp #</th>
              <th className="text-left px-2">Business #</th>
              <th className="text-center px-2">Year end</th>
              <th className="text-left px-2">Status</th>
            </tr></thead>
            <tbody>
              {data.entities.map((e: any) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="py-1.5 pr-2 font-medium">
                    {e.clientId ? <Link to={`/client/${e.clientId}`} className="hover:text-indigo-700">{e.companyName}</Link> : e.companyName}
                  </td>
                  <td className="px-2 text-slate-500">{e.operatingName || "—"}</td>
                  <td className="px-2 text-slate-500">{e.incorporationNumber || "—"}</td>
                  <td className="px-2 text-slate-500">{e.businessNumber || "—"}</td>
                  <td className="px-2 text-center text-slate-500">{e.yearEnd || "—"}</td>
                  <td className="px-2">{e.statusNote ? <Badge variant="outline" className={`text-[10px] ${/kill/i.test(e.statusNote) ? "text-red-600" : "text-slate-500"}`}>{e.statusNote}</Badge> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Dividend report */}
      <Section icon={Coins} title="Dividend / profit report" right={
        <div className="flex gap-1">
          {data.fiscalYears.map((y: string) => (
            <button key={y} onClick={() => onFiscalYear?.(y)} disabled={!onFiscalYear}
              className={`px-2 py-0.5 rounded text-xs border ${data.fiscalYear === y ? "bg-indigo-500 text-white border-indigo-500" : "bg-white border-slate-200 hover:bg-slate-50"} ${!onFiscalYear ? "opacity-60 cursor-default" : ""}`}>FY{y}</button>
          ))}
        </div>
      }>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Attributed to each owner (profit × ownership)</p>
            <div className="space-y-1">
              {data.dividendByPerson.filter((p: any) => p.type === "individual").map((p: any) => (
                <div key={p.name} className="flex items-center justify-between p-2 rounded bg-slate-50 text-sm">
                  <span>{p.name} <span className="text-xs text-slate-400">· {p.lines.length} co</span></span>
                  <span className={`font-semibold tabular-nums ${p.total >= 0 ? "text-emerald-600" : "text-red-600"}`}>{money(p.total)}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">FY{data.fiscalYear} group profit {money(data.fyTotals.ytdProfit)} · est. tax {money(data.fyTotals.taxLiability)}. Holding-co and unattributed shares excluded from the per-person list.</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5">By company (fiscal-year to date)</p>
            <div className="space-y-1">
              {data.profit.map((p: any) => (
                <div key={p.companyName} className="flex items-center justify-between p-2 rounded bg-slate-50 text-sm">
                  <span className="truncate mr-2">{p.companyName} <span className="text-xs text-slate-400">· {pct(p.ownershipPct)}</span></span>
                  <span className={`font-medium tabular-nums ${(p.ytdProfit || 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{money(p.ytdProfit)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Beneficial ownership / ISC */}
      <Section icon={ShieldCheck} title="Significant-control register (ISC ≥ 25%)">
        <p className="text-xs text-slate-500 mb-2">Individuals with significant control — the register Corporations Canada / Ontario now require. Auto-derived from the cap table.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {data.beneficialOwners.map((b: any) => (
            <div key={b.name} className="p-2.5 rounded-lg border bg-white">
              <p className="font-medium text-sm">{b.name}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {b.companies.map((c: any, i: number) => (
                  <Badge key={i} variant="outline" className="text-[10px] text-slate-600">{c.company} · {c.pct}%</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Family benefit */}
      {data.family.length > 0 && (
        <Section icon={Users} title="Family salary / benefit">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-500 border-b">
                <th className="text-left py-1.5 pr-2">Person</th>
                <th className="text-right px-2">Monthly base</th>
                <th className="text-left px-2">Paid from</th>
                <th className="text-left px-2">Note</th>
              </tr></thead>
              <tbody>
                {data.family.map((f: any) => (
                  <tr key={f.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 font-medium">{f.personName}</td>
                    <td className="px-2 text-right tabular-nums">{f.baseSalary != null ? money(f.baseSalary) : "—"}</td>
                    <td className="px-2 text-slate-500">{f.allocation || "—"}</td>
                    <td className="px-2 text-slate-400 text-xs">{f.comment || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, right, children }: { icon: any; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Icon className="h-4 w-4 text-indigo-400" /> {title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}
