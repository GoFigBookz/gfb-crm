import { useState } from "react";
import { UserPlus, ArrowRight, CheckCircle2, Globe, Phone, Mail, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";
import { splitClientName } from "@/lib/clientName";
import { Link } from "react-router";

// Lead pipeline stages, in order. "active" is the graduation point (→ Client Master).
const STAGES: Array<{ key: string; label: string; tint: string }> = [
  { key: "new_lead", label: "New Leads", tint: "border-t-blue-400" },
  { key: "discovery_call", label: "Discovery Call", tint: "border-t-violet-400" },
  { key: "onboarding_sent", label: "Onboarding Sent", tint: "border-t-amber-400" },
  { key: "onboarding_complete", label: "Onboarding Complete", tint: "border-t-emerald-400" },
];
const NEXT: Record<string, string> = {
  new_lead: "discovery_call",
  discovery_call: "onboarding_sent",
  onboarding_sent: "onboarding_complete",
  onboarding_complete: "active",
};
const SOURCE_BADGE: Record<string, string> = {
  website: "bg-blue-50 text-blue-700 border-blue-200",
  referral: "bg-emerald-50 text-emerald-700 border-emerald-200",
  manual: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function Leads() {
  const utils = trpc.useUtils();
  const pipeline = trpc.workflow.getPipeline.useQuery();
  const transition = trpc.workflow.transition.useMutation({
    onSuccess: () => utils.workflow.getPipeline.invalidate(),
  });
  const createLead = trpc.workflow.createLead.useMutation({
    onSuccess: () => { utils.workflow.getPipeline.invalidate(); setOpen(false); setForm({}); },
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const data: any = pipeline.data || {};
  const totalLeads = STAGES.reduce((n, s) => n + (data[s.key]?.length || 0), 0);

  const advance = (clientId: number, from: string) => {
    const to = NEXT[from];
    if (!to) return;
    transition.mutate({ clientId, toStatus: to as any, action: `advance_${from}_to_${to}` });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-lime-600" /> Leads
          </h1>
          <p className="text-sm text-slate-500">
            {totalLeads} in the pipeline. Website inquiries land in <b>New Leads</b>; when a lead is
            signed, <b>Mark active</b> runs the government-registry lookup and moves them to Clients.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><UserPlus className="h-4 w-4" /> Add Lead</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add a lead</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {[
                ["name", "Contact name *"], ["company", "Business name"], ["email", "Email"],
                ["phone", "Phone"], ["website", "Website"], ["source", "Source (referral, phone…)"],
                ["message", "Inquiry / notes"],
              ].map(([k, label]) => (
                <div key={k}>
                  <Label className="text-xs">{label}</Label>
                  <Input value={form[k] || ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button
                disabled={!form.name || createLead.isPending}
                onClick={() => createLead.mutate({
                  name: form.name, company: form.company || undefined, email: form.email || undefined,
                  phone: form.phone || undefined, website: form.website || undefined,
                  source: form.source || undefined, message: form.message || undefined,
                })}
              >
                {createLead.isPending ? "Adding…" : "Add lead"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {pipeline.isLoading ? (
        <p className="text-slate-400">Loading pipeline…</p>
      ) : totalLeads === 0 ? (
        <Card><CardContent className="py-12 text-center text-slate-400">
          No leads yet. Website inquiries (go-fig.ca form → <code>public.createLead</code>) and
          manually-added leads appear here.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STAGES.map((stage) => {
            const cards: any[] = data[stage.key] || [];
            return (
              <div key={stage.key} className={`rounded-lg border border-t-4 ${stage.tint} bg-slate-50/60`}>
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">{stage.label}</span>
                  <Badge variant="secondary">{cards.length}</Badge>
                </div>
                <div className="p-2 space-y-2 min-h-[60px]">
                  {cards.map((c) => {
                    const { primary, secondary } = splitClientName(c.name, c.company);
                    return (
                      <Card key={c.id} className="shadow-sm">
                        <CardContent className="p-3 space-y-2">
                          <Link to={`/client/${c.id}`} className="block">
                            <p className="font-semibold text-slate-800 text-sm leading-tight hover:underline">{primary}</p>
                            {secondary && <p className="text-xs text-slate-400">{secondary}</p>}
                          </Link>
                          <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                            {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                            {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                            {c.website && <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />{String(c.website).replace(/^https?:\/\//, "")}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {c.leadSource && (
                              <Badge variant="outline" className={SOURCE_BADGE[c.leadSource] || SOURCE_BADGE.manual}>
                                {c.leadSource}
                              </Badge>
                            )}
                            {c.estimatedMonthlyValue ? (
                              <span className="text-xs text-slate-500">${c.estimatedMonthlyValue}/mo</span>
                            ) : null}
                          </div>
                          <div className="flex gap-2 pt-1">
                            {NEXT[stage.key] === "active" ? (
                              <Button size="sm" className="h-7 gap-1 text-xs"
                                disabled={transition.isPending}
                                onClick={() => advance(c.id, stage.key)}>
                                <CheckCircle2 className="h-3 w-3" /> Mark active
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                                disabled={transition.isPending}
                                onClick={() => advance(c.id, stage.key)}>
                                Advance <ArrowRight className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 flex items-center gap-1">
        <Sparkles className="h-3 w-3" /> Marking a lead active runs the government-registry lookup
        (bio, CRA#, registry#, incorporation date) and promotes them to the Client Master sheet.
      </p>
    </div>
  );
}
