import { useParams } from "react-router";
import { Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";

const money = (n: number | null | undefined) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Public, token-gated read-only loan balances for a client. */
export default function LoanShare() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading } = trpc.loanTracker.publicView.useQuery({ token: token! }, { enabled: !!token });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-slate-500">This link isn’t valid or has been revoked.</div>;

  const dirBadge = (d: string) => d === "owed_to_lender" ? <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">owed</Badge>
    : d === "owed_to_borrower" ? <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">overpaid</Badge>
    : <Badge variant="outline" className="bg-lime-50 text-lime-700 border-lime-200">settled</Badge>;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-6 w-6 text-lime-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">{data.clientName} — Loans</h1>
            <p className="text-sm text-slate-500">Loan balances{data.label ? ` · ${data.label}` : ""} · view-only</p>
          </div>
        </div>

        {data.loans.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-slate-400">No loans on file.</CardContent></Card>
        ) : (
          <>
            <Card className="bg-white">
              <CardContent className="p-3 flex items-center justify-between">
                <span className="text-sm text-slate-600">Net owed across all loans</span>
                <span className="text-lg font-bold text-slate-900">{money(data.netOwed)}</span>
              </CardContent>
            </Card>
            {data.loans.map((l: any) => (
              <Card key={l.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span>{l.name} {l.counterparty && <span className="text-xs font-normal text-slate-400">· {l.counterparty}</span>}</span>
                    <span className="flex items-center gap-2">{dirBadge(l.summary.direction)}<span className={l.summary.balance > 0 ? "text-amber-700" : l.summary.balance < 0 ? "text-sky-700" : "text-slate-500"}>{money(l.summary.balance)}</span></span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-slate-500">
                  Advanced {money(l.summary.totalAdvanced)} · repaid {money(l.summary.totalRepaid)}{l.summary.totalInterest ? ` · interest ${money(l.summary.totalInterest)}` : ""}
                  {l.summary.lastActivity ? ` · last activity ${format(new Date(l.summary.lastActivity), "MMM d, yyyy")}` : ""}
                </CardContent>
              </Card>
            ))}
          </>
        )}
        <p className="text-center text-[11px] text-slate-400 pt-2">Generated {format(new Date(data.generatedAt), "MMM d, yyyy h:mm a")} · Figgy</p>
      </div>
    </div>
  );
}
