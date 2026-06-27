import { useState } from "react";
import { useParams, Link } from "react-router";
import { ChevronDown, Building2, CheckCircle2, Lock, ListChecks } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import PaymentSourceCard from "@/components/PaymentSourceCard";
import IntercoRechargePanel from "@/components/IntercoRechargePanel";
import {
  ClientCloseChecklist, ClientHstReviewCard, EmployeesCard, ContactsCard, GroupCard, ClientRequestsCard,
} from "./ClientDashboard";

/**
 * CLIENT WORKSPACE — the new single-page, workflow-ordered client view (Markie 2026-06-27).
 * One page, collapsible sections in the order a bookkeeper works, intake/setup at top, and
 * the operational sections gated until the client is ONBOARDED (engagement signed + deposit).
 * Order: Setup → [gate] → Payroll → Month-End Close → HST → Tools (Recharge / Interco) → Tasks.
 * Reuses the proven section components from ClientDashboard; the old tabbed view stays at
 * /client/:id/classic. v1 — intake-driven trimming + CRA pull + sheet sync land next.
 */

/** Collapsible section. Remembers open/closed per (client, key) in localStorage. */
function Section({ id, title, subtitle, icon, children, defaultOpen = false, badge, accent }: {
  id: string; title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode;
  defaultOpen?: boolean; badge?: React.ReactNode; accent?: string;
}) {
  const storeKey = `ws-open:${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    try { const v = localStorage.getItem(storeKey); return v == null ? defaultOpen : v === "1"; } catch { return defaultOpen; }
  });
  const toggle = () => setOpen((o) => { try { localStorage.setItem(storeKey, o ? "0" : "1"); } catch { /* ignore */ } return !o; });
  return (
    <Card className={cn("overflow-hidden", accent)}>
      <button type="button" onClick={toggle} className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 text-left">
        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform shrink-0", open ? "" : "-rotate-90")} />
        {icon}
        <span className="font-semibold text-slate-800">{title}</span>
        {subtitle && <span className="text-xs text-slate-400 truncate">· {subtitle}</span>}
        <span className="ml-auto flex items-center gap-2">{badge}</span>
      </button>
      {open && <CardContent className="pt-0 pb-4">{children}</CardContent>}
    </Card>
  );
}

export default function ClientWorkspace() {
  const { clientId } = useParams<{ clientId: string }>();
  const id = Number(clientId);
  const utils = trpc.useUtils();
  const { data: client } = trpc.crmClient.get.useQuery({ id }, { enabled: !!id });
  const { data: dashboardData } = trpc.clientDashboard.getByClient.useQuery({ clientId: id }, { enabled: !!id });
  const { data: closeStatus } = trpc.monthEnd.getClientStatus.useQuery({ clientId: id }, { enabled: !!id });
  const update = trpc.crmClient.update.useMutation({ onSuccess: () => utils.crmClient.get.invalidate({ id }) });

  // Onboarding gate: operational sections light up only once the client is active.
  const active = client ? (client.workflowStatus === "active" || !!client.onboardingCompletedAt) : false;
  const [engSigned, setEngSigned] = useState(false);
  const [deposit, setDeposit] = useState(false);

  if (!client) return <div className="p-8 text-slate-400">Loading…</div>;

  const tasks: any[] = (dashboardData?.tasks || []).filter((t: any) => !t.completed && t.status !== "completed");
  const hasPayroll = !!client.hasPayroll || !!(client as any).hasEmployees;
  const hasHST = !!client.hasHST;
  const isGroup = !!(client as any).groupName;
  const money = (n: number) => (n ?? 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

  return (
    <div className="space-y-3 max-w-4xl">
      <div className="flex items-center justify-between gap-2">
        <BackButton />
        <Link to={`/client/${id}/classic`} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">Classic view →</Link>
      </div>

      {/* Header + status strip */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 truncate">
            <Building2 className="h-6 w-6 text-lime-600 shrink-0" /> {client.name}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
            <Badge variant={active ? "default" : "secondary"} className={active ? "bg-emerald-600" : ""}>{active ? "Active" : (client.workflowStatus || client.status)}</Badge>
            {client.clientType && <Badge variant="outline" className="capitalize">{client.clientType}</Badge>}
            {isGroup && <Badge variant="outline">{(client as any).groupName}</Badge>}
            {hasHST && <span className="text-slate-400">HST {closeStatus?.hst?.periodLabel ? `· ${closeStatus.hst.filed ? "filed" : closeStatus.hst.overdue ? "overdue" : "due"} ${closeStatus.hst.periodLabel}` : ""}</span>}
            {closeStatus?.checklistPercent != null && <span className="text-slate-400">· Close {closeStatus.checklistPercent}%</span>}
          </div>
        </div>
      </div>

      {/* 1. SETUP / INTAKE — always visible. */}
      <Section id={`${id}-setup`} title="Client setup / intake" icon={<Building2 className="h-4 w-4 text-slate-500" />}
        defaultOpen={!active} subtitle={active ? "active" : "not onboarded yet"}>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <Field label="Company" value={client.company || client.name} />
          <Field label="Email" value={client.email} />
          <Field label="Type" value={client.clientType} />
          <Field label="Year-end" value={(client as any).yearEndMonth || "—"} />
          <Field label="HST" value={hasHST ? `Yes · ${(client as any).hstFilingFrequency || (client as any).hstPeriod || "?"}` : "No"} />
          <Field label="Payroll" value={hasPayroll ? "Yes" : "No"} />
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Link to={`/client/${id}/classic`}><Button size="sm" variant="outline">Edit full setup</Button></Link>
          <span className="text-[11px] text-slate-400">Full intake questionnaire (services, tools, CRA accounts) — moving inline next.</span>
        </div>

        {/* Onboarding gate */}
        {!active && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <div className="text-sm font-medium text-amber-900 flex items-center gap-1.5"><Lock className="h-4 w-4" /> Not onboarded — the workflow stays off until signed + paid</div>
            <label className="flex items-center gap-2 text-sm text-amber-900"><input type="checkbox" checked={engSigned} onChange={(e) => setEngSigned(e.target.checked)} /> Letter of engagement signed</label>
            <label className="flex items-center gap-2 text-sm text-amber-900"><input type="checkbox" checked={deposit} onChange={(e) => setDeposit(e.target.checked)} /> Deposit received</label>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={!engSigned || !deposit || update.isPending}
              onClick={() => update.mutate({ id, workflowStatus: "active" } as any)}>
              {update.isPending ? "Activating…" : "Activate client"}
            </Button>
            <p className="text-[11px] text-amber-700">No tasks, close, or reminders generate until you activate.</p>
          </div>
        )}
      </Section>

      {/* Operational sections — gated on active. */}
      {active ? (
        <>
          {hasPayroll && (
            <Section id={`${id}-payroll`} title="Payroll" subtitle="employees, runs, banked hours">
              <EmployeesCard clientId={id} />
              <div className="mt-2"><Link to="/payroll" className="text-xs text-lime-700 hover:underline">Open full Payroll page →</Link></div>
            </Section>
          )}

          <Section id={`${id}-close`} title="Month-end close" subtitle="post → reconcile → review → financials" icon={<CheckCircle2 className="h-4 w-4 text-indigo-500" />}
            badge={closeStatus?.checklistPercent != null ? <span className="text-xs text-slate-500">{closeStatus.checklistPercent}%</span> : undefined}>
            <ClientCloseChecklist clientId={id} />
          </Section>

          {hasHST && (
            <Section id={`${id}-hst`} title="HST" subtitle="pre-HST review + reasonableness check">
              <ClientHstReviewCard clientId={id} client={client} />
            </Section>
          )}

          <Section id={`${id}-tools`} title="Tools" subtitle="recharge, interco journal, duplicates" defaultOpen={isGroup}>
            <div className="space-y-3">
              {isGroup && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1">Recharge invoice</div>
                  <IntercoRechargePanel defaultPayerId={id} />
                </div>
              )}
              {isGroup && (
                <div className="rounded-lg border border-slate-200 p-2 text-sm">
                  <div className="font-medium text-slate-700">Inter-company journal</div>
                  <p className="text-xs text-slate-500">Ongoing to/from balance, mirror-reconcile (John's group method). <Link to="/interco" className="text-lime-700 hover:underline">Open Inter-Company →</Link></p>
                </div>
              )}
              <PaymentSourceCard clientId={id} groupName={(client as any).groupName} />
            </div>
          </Section>

          <ClientRequestsCard clientId={id} clientName={client.name} />
          {isGroup && <GroupCard clientId={id} groupName={(client as any).groupName} />}
          <ContactsCard clientId={id} />

          {/* TASKS — hidden/collapsed at the bottom by design. */}
          <Section id={`${id}-tasks`} title="Tasks" icon={<ListChecks className="h-4 w-4 text-slate-500" />}
            badge={<Badge variant={tasks.length ? "default" : "secondary"} className={tasks.length ? "bg-amber-500" : ""}>{tasks.length}</Badge>}>
            {tasks.length === 0 ? <p className="text-sm text-slate-400">No open tasks.</p> : (
              <div className="divide-y">
                {tasks.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", t.priority === "high" ? "bg-red-500" : t.priority === "medium" ? "bg-amber-400" : "bg-slate-300")} />
                    <span className="flex-1 truncate text-slate-700">{t.title}</span>
                    {t.dueDate && <span className="text-xs text-slate-400">{new Date(t.dueDate).toLocaleDateString("en-CA")}</span>}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2"><Link to={`/client/${id}/classic`} className="text-xs text-lime-700 hover:underline">Manage tasks in classic view →</Link></div>
          </Section>
        </>
      ) : (
        <Card><CardContent className="p-4 text-sm text-slate-500">The workflow (payroll, month-end, HST, tools, tasks) activates once this client is onboarded. Tick both gates above and hit <b>Activate client</b>.</CardContent></Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-100 py-0.5">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-700 font-medium text-right truncate">{value ?? "—"}</span>
    </div>
  );
}
