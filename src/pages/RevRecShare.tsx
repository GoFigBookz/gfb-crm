import { useParams } from "react-router";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Letterhead, LetterheadFooter } from "@/components/Letterhead";
import { trpc } from "@/providers/trpc";

const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
const pct = (n: number) => `${Math.round((n ?? 0) * 1000) / 10}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthShort = (key: string) => { const [y, m] = key.split("-"); return `${MONTHS[parseInt(m, 10) - 1]} ${y.slice(2)}`; };

/** Public, token-gated, read-only WIP schedule for the client. Branded + mobile. */
export default function RevRecShare() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading } = trpc.revRec.publicView.useQuery({ token: token! }, { enabled: !!token });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-slate-500">This link isn’t valid or has been revoked.</div>;

  const t = data.totals;
  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <Letterhead title="Work in Progress" client={data.clientName} subtitle={`Revenue recognised as work is completed${data.label ? ` · ${data.label}` : ""}`} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile label="Contract value" value={money(t.contractValue)} />
          <Tile label="Earned to date" value={money(t.earnedToDate)} />
          <Tile label="Billed to date" value={money(t.invoicedToDate)} />
          <Tile label="Remaining to earn" value={money(t.remainingToEarn)} />
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Jobs</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="border-b text-xs text-slate-500">
                <th className="text-left py-2 pr-2">Job</th>
                <th className="text-right px-2">Contract</th>
                <th className="text-right px-2">% complete</th>
                <th className="text-right px-2">Earned</th>
                <th className="text-right px-2">Billed</th>
                <th className="text-right pl-2">Remaining</th>
              </tr></thead>
              <tbody>
                {data.projects.map((p, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-2 pr-2 font-medium">{p.name}</td>
                    <td className="text-right px-2 tabular-nums">{money(p.contractValue)}</td>
                    <td className="text-right px-2 tabular-nums">{pct(p.pctComplete)}</td>
                    <td className="text-right px-2 tabular-nums">{money(p.earnedToDate)}</td>
                    <td className="text-right px-2 tabular-nums">{money(p.invoicedToDate)}</td>
                    <td className="text-right pl-2 tabular-nums">{money(p.remainingToEarn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {data.calendar?.rows?.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Revenue by month</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="border-b text-xs text-slate-500">
                  <th className="text-left py-2 pr-2 sticky left-0 bg-white">Job</th>
                  {data.calendar.months.map((m: string) => <th key={m} className="text-right px-2 whitespace-nowrap">{monthShort(m)}</th>)}
                  <th className="text-right pl-2">Total</th>
                </tr></thead>
                <tbody>
                  {data.calendar.rows.map((r: any) => (
                    <tr key={r.projectId} className="border-b">
                      <td className="py-2 pr-2 sticky left-0 bg-white font-medium">{r.name}</td>
                      {r.byMonth.map((v: number, i: number) => <td key={i} className="text-right px-2 tabular-nums">{v ? money(v) : "—"}</td>)}
                      <td className="text-right pl-2 tabular-nums font-medium">{money(r.total)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-2 sticky left-0 bg-white">Total</td>
                    {data.calendar.totalsByMonth.map((v: number, i: number) => <td key={i} className="text-right px-2 tabular-nums">{v ? money(v) : "—"}</td>)}
                    <td className="text-right pl-2 tabular-nums">{money(data.calendar.grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <LetterheadFooter generatedAt={data.generatedAt} />
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </CardContent></Card>
  );
}
