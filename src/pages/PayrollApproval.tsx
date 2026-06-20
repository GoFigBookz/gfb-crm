import { useState } from "react";
import { useParams } from "react-router";
import { Wallet, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";

const money = (n: number) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Public, token-gated page where a client reviews and approves payroll hours. */
export default function PayrollApproval() {
  const { token } = useParams<{ token: string }>();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.public.payrollApprovalGet.useQuery({ token: token! }, { enabled: !!token });
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const submit = trpc.public.payrollApprovalSubmit.useMutation({
    onSuccess: () => utils.public.payrollApprovalGet.invalidate({ token: token! }),
    onError: (e) => alert(e.message),
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-slate-500">This approval link isn’t valid or has expired.</div>;

  const done = data.status === "approved" || data.status === "changes_requested";

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-lime-600" />
          <h1 className="text-xl font-bold text-slate-900">Payroll hours for approval</h1>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{data.clientName}</CardTitle>
            <p className="text-sm text-slate-500">
              Pay period {format(new Date(data.payPeriodStart), "MMM d")} – {format(new Date(data.payPeriodEnd), "MMM d, yyyy")}
              {data.payDate ? ` · pay date ${format(new Date(data.payDate), "MMM d, yyyy")}` : ""}
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b">
                    <th className="text-left py-1.5 pr-2">Employee</th>
                    <th className="text-right px-2">Reg hrs</th>
                    <th className="text-right px-2">OT hrs</th>
                    <th className="text-right px-2">Stat $</th>
                    <th className="text-right px-2">Share bonus</th>
                    <th className="text-right px-2">Gross</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 pr-2 font-medium">{l.name}</td>
                      <td className="text-right px-2">{l.regularHours}</td>
                      <td className="text-right px-2">{l.overtimeHours}</td>
                      <td className="text-right px-2">{money(l.statHolidayPay)}</td>
                      <td className="text-right px-2">{money(l.shareBonus)}</td>
                      <td className="text-right px-2 font-medium">{money(l.grossPay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {done ? (
          <Card className={data.status === "approved" ? "border-lime-300 bg-lime-50/40" : "border-amber-300 bg-amber-50/40"}>
            <CardContent className="p-4 flex items-start gap-2">
              {data.status === "approved" ? <CheckCircle2 className="h-5 w-5 text-lime-600 mt-0.5" /> : <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />}
              <div className="text-sm text-slate-700">
                <p className="font-medium">{data.status === "approved" ? "Approved" : "Changes requested"} by {data.approvedByName}</p>
                {data.approvedAt && <p className="text-xs text-slate-500">{format(new Date(data.approvedAt), "MMM d, yyyy h:mm a")}</p>}
                {data.approvalNote && <p className="mt-1">{data.approvalNote}</p>}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <Label>Your name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Who is approving?" />
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Any changes or comments…" />
              </div>
              <div className="flex gap-2">
                <Button disabled={!name.trim() || submit.isPending} onClick={() => submit.mutate({ token: token!, approverName: name.trim(), decision: "approved", note })}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve hours
                </Button>
                <Button variant="outline" disabled={!name.trim() || submit.isPending} onClick={() => submit.mutate({ token: token!, approverName: name.trim(), decision: "changes_requested", note })}>
                  Request changes
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
