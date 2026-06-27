import { useState } from "react";
import { useParams, Link } from "react-router";
import { ChevronDown, Building2, CheckCircle2, Lock, ListChecks } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import BackButton from "@/components/BackButton";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
import PaymentSourceCard from "@/components/PaymentSourceCard";
import IntercoRechargePanel from "@/components/IntercoRechargePanel";
import VendorRulesPanel from "@/components/VendorRulesPanel";
import StatementCodingPanel from "@/components/StatementCodingPanel";
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
  const set = (patch: Record<string, any>) => update.mutate({ id, ...patch } as any);

  // Onboarding gate: operational sections light up only once the client is active.
  const active = client ? (client.workflowStatus === "active" || !!client.onboardingCompletedAt) : false;
  const [engSigned, setEngSigned] = useState(false);
  const [deposit, setDeposit] = useState(false);

  if (!client) return <div className="p-8 text-slate-400">Loading…</div>;

  const tasks: any[] = (dashboardData?.tasks || []).filter((t: any) => !t.completed && t.status !== "completed");
  const hasPayroll = !!client.hasPayroll || !!(client as any).hasEmployees;
  const hasHST = !!client.hasHST;
  const isGroup = !!(client as any).groupName;
  const hasRecharge = !!(client as any).hasRecharge;
  const hasInterco = !!(client as any).hasIntercoJournals;
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

      {/* 1. SETUP / INTAKE — editable; the toggles drive which sections appear + the tasks. */}
      <Section id={`${id}-setup`} title="Client setup / intake" icon={<Building2 className="h-4 w-4 text-slate-500" />}
        defaultOpen={!active} subtitle={active ? "active" : "not onboarded yet"}>
        <div className="space-y-3 text-sm">
          {/* Core */}
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
            <Field label="Company" value={client.company || client.name} />
            <Field label="Email" value={client.email} />
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 py-0.5">
              <span className="text-slate-400">Client type</span>
              <select className="border rounded px-1.5 py-0.5 text-sm bg-white" value={client.clientType || "monthly"}
                onChange={(e) => set({ clientType: e.target.value })}>
                {["monthly", "quarterly", "annual", "payroll", "wholesale"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 py-0.5">
              <span className="text-slate-400">Year-end month</span>
              <select className="border rounded px-1.5 py-0.5 text-sm bg-white" value={(client as any).yearEndMonth || ""}
                onChange={(e) => set({ yearEndMonth: e.target.value || undefined, fiscalYearEndMonth: e.target.value ? (MONTHS.indexOf(e.target.value) + 1) : undefined })}>
                <option value="">—</option>
                {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Services — the switches that drive the page */}
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Services &amp; tools (what this client needs)</div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5">
              <Toggle label="Payroll" on={hasPayroll} onChange={(v) => set({ hasPayroll: v })} />
              <Toggle label="HST/GST" on={hasHST} onChange={(v) => set({ hasHST: v })} />
              <Toggle label="Credit cards" on={(client as any).hasCreditCard !== false} onChange={(v) => set({ hasCreditCard: v })} />
              <Toggle label="WSIB" on={!!(client as any).hasWSIB} onChange={(v) => set({ hasWSIB: v })} />
              <Toggle label="Recharge invoice" on={!!(client as any).hasRecharge} onChange={(v) => set({ hasRecharge: v })} />
              <Toggle label="Inter-company journal" on={!!(client as any).hasIntercoJournals} onChange={(v) => set({ hasIntercoJournals: v })} />
            </div>
            {hasHST && (
              <div className="mt-1.5 flex items-center gap-2 text-xs">
                <span className="text-slate-400">HST frequency</span>
                <select className="border rounded px-1.5 py-0.5 bg-white" value={(client as any).hstFilingFrequency || (client as any).hstPeriod || ""}
                  onChange={(e) => set({ hstFilingFrequency: e.target.value || undefined, hstPeriod: (e.target.value || undefined) as any })}>
                  <option value="">—</option>{["monthly", "quarterly", "annual"].map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* CRA / government accounts — the onboarding "pull from CRA" step */}
          <div className="rounded-lg border border-slate-200 p-2">
            <div className="text-xs font-semibold text-slate-500 mb-1">CRA / government accounts</div>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-slate-400">Business #</span>
              <input className="border rounded px-1.5 py-0.5 w-44 font-mono" defaultValue={(client as any).craBusinessNumber || ""}
                onBlur={(e) => { if (e.target.value !== ((client as any).craBusinessNumber || "")) set({ craBusinessNumber: e.target.value }); }} placeholder="123456789 RT0001" />
              {(client as any).craPulledAt
                ? <span className="text-emerald-600">✓ pulled {new Date((client as any).craPulledAt).toLocaleDateString("en-CA")}</span>
                : <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => set({ craPulledAt: Date.now() })}>Mark pulled from CRA</Button>}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Capture the BN + RT (HST) / RP (payroll) program accounts from Represent a Client; these set the HST + payroll filing details.</p>
          </div>

          <div className="flex items-center gap-2">
            <Link to={`/client/${id}/classic`}><Button size="sm" variant="ghost" className="text-xs text-slate-500">Full classic form ↗</Button></Link>
            {update.isPending && <span className="text-[11px] text-slate-400">saving…</span>}
            <span className="text-[11px] text-slate-400">Edits save live + sync to the master sheet, and switch the sections below on/off.</span>
          </div>
        </div>

        {/* Onboarding gate */}
        {!active && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <div className="text-sm font-medium text-amber-900 flex items-center gap-1.5"><Lock className="h-4 w-4" /> Not onboarded — the workflow stays off until signed + paid</div>
            <label className="flex items-center gap-2 text-sm text-amber-900"><input type="checkbox" checked={engSigned} onChange={(e) => setEngSigned(e.target.checked)} /> Letter of engagement signed</label>
            <label className="flex items-center gap-2 text-sm text-amber-900"><input type="checkbox" checked={deposit} onChange={(e) => setDeposit(e.target.checked)} /> Deposit received</label>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={!engSigned || !deposit || update.isPending}
              onClick={() => update.mutate({ id, workflowStatus: "active", depositReceivedAt: Date.now() } as any)}>
              {update.isPending ? "Activating…" : "Activate client"}
            </Button>
            <p className="text-[11px] text-amber-700">No tasks, close, or reminders generate until you activate.</p>
          </div>
        )}
      </Section>

      {/* QUICKBOOKS overview — live high-level numbers, read-only. */}
      <QboOverviewSection clientId={id} />

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

          {(hasRecharge || hasInterco || isGroup || active) && (
            <Section id={`${id}-tools`} title="Tools" subtitle="vendor rules, recharge, interco journal, duplicates" defaultOpen={hasRecharge || hasInterco}>
              <div className="space-y-3">
                <StatementCodingPanel clientId={id} />
                <VendorRulesPanel clientId={id} />
                {hasRecharge && (
                  <div>
                    <div className="text-xs font-semibold text-slate-500 mb-1">Recharge invoice</div>
                    <IntercoRechargePanel defaultPayerId={id} />
                  </div>
                )}
                {hasInterco && (
                  <div className="rounded-lg border border-slate-200 p-2 text-sm">
                    <div className="font-medium text-slate-700">Inter-company journal</div>
                    <p className="text-xs text-slate-500">Ongoing to/from balance, mirror-reconcile (John's group method). <Link to="/interco" className="text-lime-700 hover:underline">Open Inter-Company →</Link></p>
                  </div>
                )}
                <PaymentSourceCard clientId={id} groupName={(client as any).groupName} />
              </div>
            </Section>
          )}

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

/** Live QuickBooks high-level numbers (lazy — only fetches when the section is open). */
function QboOverviewSection({ clientId }: { clientId: number }) {
  const [open, setOpen] = useState<boolean>(() => { try { return localStorage.getItem(`ws-open:${clientId}-qbo`) !== "0"; } catch { return true; } });
  const { data, isFetching } = trpc.clientDashboard.qboOverview.useQuery({ clientId }, { enabled: open && clientId > 0, staleTime: 5 * 60_000 });
  const money = (n: number | null | undefined) => n == null ? "—" : (n).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
  const toggle = () => setOpen((o) => { try { localStorage.setItem(`ws-open:${clientId}-qbo`, o ? "0" : "1"); } catch { /* */ } return !o; });
  return (
    <Card className="overflow-hidden border-emerald-200">
      <button type="button" onClick={toggle} className="w-full flex items-center gap-2 px-4 py-3 hover:bg-emerald-50/40 text-left">
        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform shrink-0", open ? "" : "-rotate-90")} />
        <span className="font-semibold text-slate-800">QuickBooks</span>
        <span className="text-xs text-slate-400">· live snapshot</span>
        {isFetching && <span className="text-[11px] text-slate-400">loading…</span>}
        {data && data.ok && (data as any).transport !== "native" && <span className="ml-auto text-[10px] text-amber-600">read-only bridge</span>}
      </button>
      {open && (
        <CardContent className="pt-0 pb-4">
          {data && !data.ok ? (
            <p className="text-xs text-amber-700">{data.error === "bridge_not_returning_data" ? "Live QBO not returning data yet (bridge config)." : `No usable QBO connection (${data.error}).`}</p>
          ) : data && data.ok ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="Cash" value={money(data.cashTotal)} sub={data.cashUsd ? `incl. ${money(data.cashUsd)} USD` : undefined} />
                <Stat label="Credit cards owed" value={money(data.creditCardOwed)} />
                <Stat label="A/R" value={money(data.ar)} />
                <Stat label="A/P" value={money(data.ap)} />
                <Stat label="Revenue (YTD)" value={money(data.revenue)} />
                <Stat label="Expenses (YTD)" value={money(data.expenses)} />
                <Stat label="Net income (YTD)" value={money(data.netIncome)} accent={data.netIncome != null && data.netIncome < 0 ? "text-red-600" : "text-emerald-700"} />
                <Stat label="Uncategorized" value={money(data.uncategorized)} sub={data.uncategorizedCount ? `${data.uncategorizedCount} acct(s)` : undefined} accent={data.uncategorized > 0 ? "text-amber-600" : undefined} />
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">{data.companyName ? `${data.companyName} · ` : ""}YTD {data.periodFrom} → {data.periodTo}. High-level only — open QuickBooks for detail.</p>
            </>
          ) : (
            <p className="text-xs text-slate-400">Loading QuickBooks…</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-lg border bg-white p-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={cn("text-base font-semibold tabular-nums", accent || "text-slate-800")}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 py-0.5 cursor-pointer text-sm">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className={on ? "text-slate-700" : "text-slate-400"}>{label}</span>
    </label>
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
