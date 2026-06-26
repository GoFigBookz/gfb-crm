import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { CheckSquare, Calendar, Save, CheckCircle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MonthlyCloseChecklist() {
  const { can } = useAuth();
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString());

  const { data: clients } = trpc.crmClient.list.useQuery();
  const utils = trpc.useUtils();

  const clientId = selectedClient ? parseInt(selectedClient) : 0;

  const { data: checklist, refetch: refetchChecklist } = trpc.monthlyClose.getOrCreate.useQuery(
    { clientId, year: parseInt(selectedYear), month: parseInt(selectedMonth) },
    { enabled: clientId > 0 }
  );

  const { data: checklistItems } = trpc.monthlyClose.getChecklistDefinition.useQuery(
    { clientId },
    { enabled: clientId > 0 }
  );
  const { data: flags } = trpc.monthlyClose.clientFlags.useQuery(
    { clientId },
    { enabled: clientId > 0 }
  );
  const setHasCreditCard = trpc.monthlyClose.setHasCreditCard.useMutation({
    onSuccess: () => {
      utils.monthlyClose.clientFlags.invalidate({ clientId });
      utils.monthlyClose.getChecklistDefinition.invalidate({ clientId });
      refetchChecklist();
    },
  });

  const toggleItem = trpc.monthlyClose.toggleItem.useMutation({
    onSuccess: () => refetchChecklist(),
  });

  const markAll = trpc.monthlyClose.markAll.useMutation({
    onSuccess: () => refetchChecklist(),
  });

  const updateNotes = trpc.monthlyClose.updateNotes.useMutation({
    onSuccess: () => refetchChecklist(),
  });

  const [notes, setNotes] = useState("");

  const handleToggle = (field: string, checked: boolean) => {
    if (!checklist) return;
    toggleItem.mutate({ id: checklist.id, field, checked });
  };

  const handleSaveNotes = () => {
    if (!checklist) return;
    updateNotes.mutate({ id: checklist.id, notes });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <CheckSquare className="h-6 w-6 text-lime-500" />
          Monthly Close Checklist
        </h1>
        <p className="text-slate-500 mt-1">
          Track month-end closing procedures per client. Check items off as you complete them.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label className="mb-2 block">Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
                <SelectContent>
                  {[...(clients || [])].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-32">
              <Label className="mb-2 block">Year</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2027">2027</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-40">
              <Label className="mb-2 block">Month</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      {format(new Date(2024, i, 1), "MMMM")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {checklist && (
        <>
          {/* Progress */}
          <Card className={cn(checklist.completionPercent === 100 && "border-emerald-300 bg-emerald-50/30")}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {checklist.completionPercent === 100 ? (
                    <CheckCircle className="h-6 w-6 text-emerald-500" />
                  ) : (
                    <Calendar className="h-6 w-6 text-lime-500" />
                  )}
                  <div>
                    <p className="font-semibold">
                      {checklist.completionPercent === 100
                        ? "Monthly Close Complete!"
                        : `Monthly Close — ${checklist.completionPercent}% Complete`}
                    </p>
                    {checklist.completedAt && (
                      <p className="text-sm text-slate-500">
                        Completed on {format(new Date(checklist.completedAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    )}
                  </div>
                </div>
                <Badge
                  variant={checklist.completionPercent === 100 ? "default" : "outline"}
                  className={cn(
                    checklist.completionPercent === 100 && "bg-emerald-500"
                  )}
                >
                  {checklist.completionPercent}%
                </Badge>
              </div>
              <Progress value={checklist.completionPercent} className="h-3" />
            </CardContent>
          </Card>

          {/* Checklist Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle>Close Procedures</CardTitle>
                  <CardDescription>
                    Tailored to this client — only the steps that apply to them show here.
                  </CardDescription>
                </div>
                {checklist && (
                  <Button size="sm" variant="outline" disabled={markAll.isPending}
                    onClick={() => markAll.mutate({ id: checklist.id, done: checklist.completionPercent !== 100 })}>
                    <CheckCircle className="h-4 w-4 mr-1" /> {checklist.completionPercent === 100 ? "Clear all" : "Mark all done"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {flags && (
                <label className="flex items-center gap-2 text-xs text-slate-500 pb-1 border-b cursor-pointer">
                  <Checkbox
                    checked={flags.hasCreditCard}
                    onCheckedChange={(v) => setHasCreditCard.mutate({ clientId, value: v as boolean })}
                  />
                  This client has credit cards (shows the credit-card reconcile step)
                </label>
              )}
              {checklistItems?.map((item) => {
                const checked = (checklist as any)[item.field] === true || (checklist as any)[item.field] === 1;
                return (
                  <div
                    key={item.field}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                      checked ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => handleToggle(item.field, v as boolean)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <p className={cn("text-sm", checked && "line-through text-slate-400")}>
                        {item.label}
                      </p>
                    </div>
                    {checked && <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Close Notes</CardTitle>
              <CardDescription>Any special notes for this month's close</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                defaultValue={checklist.notes || ""}
                placeholder="Add notes about this month's close..."
                rows={4}
                onChange={(e) => setNotes(e.target.value)}
              />
              <Button onClick={handleSaveNotes} size="sm" className="bg-lime-500">
                <Save className="h-4 w-4 mr-2" /> Save Notes
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {!selectedClient && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center text-slate-400">
            <CheckSquare className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-lg">Select a client to view their monthly close checklist</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
