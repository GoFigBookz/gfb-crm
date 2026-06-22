import { Link } from "react-router";
import { TrendingUp, Building2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString()}`;

/**
 * Owner-only pricing intelligence: recommended scope-based fee vs what we bill,
 * across all active clients. Surfaces under-billed clients first. (Engine =
 * quote.allInsights; route is owner/senior-gated.)
 */
export default function Insights() {
  const { data, isLoading, error } = trpc.quote.allInsights.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-lime-600" /> Pricing Insights
        </h1>
        <p className="text-slate-500">Owner view — what we should bill (scope-based) vs what we bill today.</p>
      </div>

      {isLoading && <Card><CardContent className="py-12 text-center text-slate-400">Crunching the numbers…</CardContent></Card>}
      {error && <Card><CardContent className="py-12 text-center text-red-500">{error.message}</CardContent></Card>}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Currently billed / mo</p><p className="text-2xl font-bold">{money(data.totalBilled)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Recommended / mo</p><p className="text-2xl font-bold text-lime-700">{money(data.totalRecommended)}</p></CardContent></Card>
            <Card className={data.gap > 0 ? "border-amber-300" : ""}><CardContent className="p-4"><p className="text-xs text-slate-500">Monthly gap</p><p className={`text-2xl font-bold ${data.gap > 0 ? "text-amber-600" : "text-slate-700"}`}>{money(data.gap)}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">By client</CardTitle>
              <CardDescription>Most under-billed first. Recommended is a scope-based estimate — a conversation starter, not an auto-change.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b">
                    <th className="text-left py-1.5 pr-2">Client</th>
                    <th className="text-right px-2">Billed</th>
                    <th className="text-right px-2">Recommended</th>
                    <th className="text-right px-2">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r: any) => {
                    const under = r.variance != null && r.variance > 10;
                    return (
                      <tr key={r.clientId} className="border-b last:border-0">
                        <td className="py-1.5 pr-2">
                          <Link to={`/client/${r.clientId}`} className="inline-flex items-center gap-1.5 hover:text-lime-700 hover:underline">
                            <Building2 className="h-3.5 w-3.5 text-slate-400" /> {r.name}
                          </Link>
                        </td>
                        <td className="text-right px-2">{money(r.flatFee)}</td>
                        <td className="text-right px-2 text-lime-700">{money(r.recommended)}</td>
                        <td className={`text-right px-2 font-medium ${under ? "text-amber-600" : "text-slate-500"}`}>
                          {r.variance == null ? "—" : (r.variance > 0 ? `+${money(r.variance)}` : money(r.variance))}
                          {under && <AlertTriangle className="h-3 w-3 inline ml-1" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
