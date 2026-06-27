import { useState, useEffect } from "react";
import { Plus, Search, Users, Globe, LayoutGrid, List, AlertTriangle, ArrowUpDown, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import HelpButton from "@/components/HelpButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { splitClientName, logoFromWebsite } from "@/lib/clientName";
import { Link, useSearchParams, useNavigate } from "react-router";

const INDUSTRIES: Record<string, string> = {
  technology: "💻 Technology", construction: "🏗️ Construction",
  restaurant: "🍽️ Restaurant", healthcare: "🏥 Healthcare",
  manufacturing: "🏭 Manufacturing", professional_services: "💼 Professional Services",
  holding_company: "🏢 Holding Company", import_export: "🌐 Import/Export",
  personal_services: "✂️ Personal Services", other: "📁 Other",
};

const FIRM_INFO: Record<string, { flag: string; label: string; color: string }> = {
  ca_clients: { flag: "🇨🇦", label: "Go Fig Bookz CA", color: "bg-red-50 text-red-700 border-red-200" },
  us_clients: { flag: "🇺🇸", label: "Go Fig Bookz US", color: "bg-blue-50 text-blue-700 border-blue-200" },
};

const CLIENT_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  monthly: { label: "Monthly", color: "bg-blue-50 text-blue-700 border-blue-200" },
  quarterly: { label: "Quarterly", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  annual: { label: "Annual", color: "bg-purple-50 text-purple-700 border-purple-200" },
  payroll: { label: "Payroll", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  wholesale: { label: "Wholesale", color: "bg-slate-100 text-slate-600 border-slate-200" },
};

const TRAFFIC: Record<string, string> = { red: "bg-red-500", yellow: "bg-amber-400", green: "bg-lime-500" };

// Deterministic monogram colour from the client id — stable, calm palette.
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700", "bg-teal-100 text-teal-700",
];
const avatarColor = (id: number) => AVATAR_COLORS[id % AVATAR_COLORS.length];
const monogram = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

// Client avatar: the website logo when we can derive one, else a monogram.
// Falls back to the monogram if the logo image fails to load.
function ClientAvatar({ id, name, website, size = "md" }: { id: number; name: string; website?: string | null; size?: "md" | "sm" }) {
  const [failed, setFailed] = useState(false);
  const logo = failed ? null : logoFromWebsite(website);
  const dim = size === "md" ? "h-10 w-10" : "h-8 w-8";
  if (logo) {
    return <img src={logo} alt="" loading="lazy" onError={() => setFailed(true)}
      className={cn(dim, "rounded-lg object-contain bg-white border border-slate-200 p-0.5")} />;
  }
  return (
    <div className={cn(dim, "rounded-lg flex items-center justify-center font-semibold", size === "md" ? "text-sm" : "text-xs", avatarColor(id))}>
      {monogram(name)}
    </div>
  );
}

function missingInfo(c: any): string[] {
  const m: string[] = [];
  if (!c.taxId) m.push("CRA#");
  if (c.hasHST && !c.hstNumber) m.push("HST#");
  if (c.hasPayroll && !c.payrollRpNumber) m.push("Payroll#");
  if (c.hasWSIB && !c.wsibAccountNumber) m.push("WSIB#");
  return m;
}

const TABS = ["all", "active", "lead", "prospect", "inactive"] as const;

type TabType = typeof TABS[number];
type SortType = "name" | "health";
type ViewType = "grid" | "list";

export default function Clients() {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStatus = searchParams.get("status") as TabType | null;
  const [tab, setTab] = useState<TabType>(urlStatus && TABS.includes(urlStatus) ? urlStatus : "active");
  const [search, setSearch] = useState("");
  const [firmFilter, setFirmFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [sort, setSort] = useState<SortType>("name");
  const [viewMode, setViewMode] = useState<ViewType>("grid");
  const [showDupes, setShowDupes] = useState(false);
  const dupes = trpc.cleanup.duplicateClients.useQuery(undefined, { enabled: showDupes });
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newClient, setNewClient] = useState({
    name: "", email: "", phone: "", company: "",
    status: "active" as "active" | "inactive",
    qboAccountType: "ca_clients" as "ca_clients" | "us_clients",
  });

  // Sync tab with URL ?status= param
  useEffect(() => {
    if (urlStatus && TABS.includes(urlStatus) && urlStatus !== tab) {
      setTab(urlStatus);
    }
  }, [urlStatus]);

  // Update URL when tab changes (if user clicked a tab)
  const handleTabChange = (t: TabType) => {
    setTab(t);
    setSearchParams({ status: t });
  };

  // Fetch ALL (status filtering is done client-side below) so the tabs + counts
  // stay consistent and the "lead" tab shows leads AND prospects to match its badge.
  const { data: clients, isLoading } = trpc.crmClient.list.useQuery({
    search: search || undefined,
    status: "all",
    limit: 100,
  });

  const matchTab = (c: any) =>
    tab === "all" ? true
    : tab === "active" ? c.status === "active"
    : tab === "lead" ? (c.status === "lead" || c.status === "prospect")
    : tab === "prospect" ? c.status === "prospect"
    : tab === "inactive" ? c.status === "inactive"
    : true;

  // Month-end close health per client → traffic light + "to post" on each card.
  const { data: portfolio } = trpc.monthEnd.getPortfolio.useQuery({});
  const healthById = new Map<number, { status: string; toReview: number }>();
  for (const c of (portfolio?.clients ?? []) as any[]) healthById.set(c.clientId, { status: c.status, toReview: c.toReview });

  const healthRank: Record<string, number> = { red: 0, yellow: 1, green: 2 };
  // Payroll classification. Wholesale (flow-through) is NEVER payroll. "Auto" =
  // QuickBooks autopay (West York, Fractal, or hours-source = qbo_autopay);
  // everyone else with payroll is "manual" (hours entered/imported here).
  const isPayrollC = (c: any) => (c.clientType || "monthly") !== "wholesale" && (c.hasPayroll || c.clientType === "payroll");
  const isAutoPay = (c: any) => c.payrollHoursSource === "qbo_autopay" || /west\s*york|fractal/i.test(c.name || "");
  // "Client runs their own payroll" — we only reconcile at year-end, not per period.
  const isClientRun = (c: any) => c.payrollFrequency === "self" || !!c.payrollExternal;
  const filtered = clients?.filter((c) => {
    if (!matchTab(c)) return false;
    if (firmFilter !== "all" && (c as any).qboAccountType !== firmFilter) return false;
    if (groupFilter !== "all" && ((c as any).groupName || "") !== groupFilter) return false;
    // Payroll filters are flag-based (hasPayroll), not a clientType value.
    if (typeFilter === "payroll") { if (!isPayrollC(c)) return false; }
    else if (typeFilter === "payroll_manual") { if (!isPayrollC(c) || isAutoPay(c) || isClientRun(c)) return false; }
    else if (typeFilter === "payroll_auto") { if (!isPayrollC(c) || !isAutoPay(c)) return false; }
    else if (typeFilter === "payroll_self") { if (!isClientRun(c)) return false; }
    else if (typeFilter !== "all" && ((c as any).clientType || "monthly") !== typeFilter) return false;
    return true;
  }).slice().sort((a, b) => {
    if (sort === "health") {
      const ha = healthById.get(a.id), hb = healthById.get(b.id);
      const ra = ha ? healthRank[ha.status] ?? 3 : 4;
      const rb = hb ? healthRank[hb.status] ?? 3 : 4;
      if (ra !== rb) return ra - rb;
      if ((hb?.toReview ?? 0) !== (ha?.toReview ?? 0)) return (hb?.toReview ?? 0) - (ha?.toReview ?? 0);
    }
    return splitClientName(a.name, (a as any).company).primary.localeCompare(splitClientName(b.name, (b as any).company).primary);
  });

  const createClient = trpc.crmClient.create.useMutation({
    onSuccess: () => { utils.crmClient.list.invalidate(); setIsAddOpen(false); },
  });

  const tabCounts: Record<TabType, number> = {
    all: clients?.length ?? 0,
    active: clients?.filter(c => c.status === "active").length ?? 0,
    lead: clients?.filter(c => c.status === "lead" || c.status === "prospect").length ?? 0,
    prospect: clients?.filter(c => c.status === "prospect").length ?? 0,
    inactive: clients?.filter(c => c.status === "inactive").length ?? 0,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">Clients <HelpButton id="clients" /></h1>
          <p className="text-slate-500 text-sm">Go Fig Bookz — {filtered?.length ?? 0} clients</p>
        </div>
        {/* Add Client goes straight to the full intake form */}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowDupes((v) => !v)}>{showDupes ? "Hide duplicates" : "Find duplicates"}</Button>
          <Button onClick={() => navigate("/onboarding?intake=1")}><Plus className="h-4 w-4 mr-2" />Add Client</Button>
        </div>
      </div>

      {showDupes && (
        <Card><CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Possible duplicate clients</span>
            <HelpButton id="find-duplicates" />
            {dupes.isFetching && <span className="text-xs text-slate-400">scanning…</span>}
            {dupes.data && <span className="text-xs text-slate-400">{dupes.data.pairs.length} pair(s) · {dupes.data.scanned} clients</span>}
          </div>
          {dupes.data && dupes.data.pairs.length === 0 && <div className="text-sm text-slate-500">No likely duplicates found. 🎉</div>}
          {dupes.data?.pairs.map((p: any, i: number) => (
            <div key={i} className="border rounded-lg p-2.5 flex items-center gap-3 flex-wrap">
              <span className={`text-[10px] uppercase font-semibold rounded px-1.5 py-0.5 ${p.strength === "strong" ? "bg-red-100 text-red-700" : p.strength === "likely" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{p.strength}</span>
              <button className="text-sm text-indigo-700 hover:underline" onClick={() => navigate(`/client/${p.a.id}`)}>{p.a.name}</button>
              <span className="text-slate-300">↔</span>
              <button className="text-sm text-indigo-700 hover:underline" onClick={() => navigate(`/client/${p.b.id}`)}>{p.b.name}</button>
              <span className="text-xs text-slate-500">{p.reasons.join(" · ")}</span>
            </div>
          ))}
          <p className="text-[11px] text-slate-400">Read-only — open each card to compare, then merge by hand. Automatic merging isn't enabled because re-pointing data blindly could collapse two separate QuickBooks companies (per-client isolation).</p>
        </CardContent></Card>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => handleTabChange(t)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors",
              tab === t
                ? "border-lime-600 text-lime-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}>
            {t}
            <span className={cn(
              "ml-2 px-1.5 py-0.5 rounded-full text-xs",
              tab === t ? "bg-lime-100 text-lime-700" : "bg-slate-100 text-slate-500"
            )}>
              {tabCounts[t] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search clients..." className="pl-9"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={firmFilter} onValueChange={setFirmFilter}>
          <SelectTrigger className="w-[200px]">
            <Globe className="h-4 w-4 mr-2 text-slate-400" />
            <SelectValue placeholder="All Firms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">🌍 All Firms</SelectItem>
            <SelectItem value="ca_clients">🇨🇦 Go Fig Bookz CA</SelectItem>
            <SelectItem value="us_clients">🇺🇸 Go Fig Bookz US</SelectItem>
          </SelectContent>
        </Select>
        {(() => {
          const groups = Array.from(new Set((clients ?? []).map((c: any) => c.groupName).filter(Boolean))).sort() as string[];
          if (groups.length === 0) return null;
          return (
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-[200px]">
                <Building2 className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue placeholder="All groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groups</SelectItem>
                {groups.map((g) => <SelectItem key={g} value={g}>👥 {g}</SelectItem>)}
              </SelectContent>
            </Select>
          );
        })()}
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="monthly">🗓️ Monthly</SelectItem>
            <SelectItem value="quarterly">📅 Quarterly</SelectItem>
            <SelectItem value="annual">📆 Annual</SelectItem>
            <SelectItem value="payroll">💵 Payroll (all)</SelectItem>
            <SelectItem value="payroll_manual">✍️ Payroll — manual entry</SelectItem>
            <SelectItem value="payroll_auto">🤖 Payroll — QuickBooks autopay</SelectItem>
            <SelectItem value="payroll_self">🙋 Payroll — client runs it (year-end recon)</SelectItem>
            <SelectItem value="wholesale">🧾 Wholesale (flow-through)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortType)}>
          <SelectTrigger className="w-[180px]">
            <ArrowUpDown className="h-4 w-4 mr-2 text-slate-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort: Name (A–Z)</SelectItem>
            <SelectItem value="health">Sort: Needs attention</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex rounded-lg border bg-white p-0.5">
          <button onClick={() => setViewMode("grid")} title="Grid view"
            className={cn("px-2 py-1.5 rounded-md transition-colors", viewMode === "grid" ? "bg-lime-500 text-white" : "text-slate-500 hover:bg-slate-100")}>
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button onClick={() => setViewMode("list")} title="List view"
            className={cn("px-2 py-1.5 rounded-md transition-colors", viewMode === "list" ? "bg-lime-500 text-white" : "text-slate-500 hover:bg-slate-100")}>
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Client Grid */}
      {isLoading ? (
        <div className="text-center py-20 text-slate-400">Loading clients...</div>
      ) : !filtered?.length ? (
        <div className="text-center py-20 text-slate-400">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No {tab === "all" ? "" : tab + " "}clients found</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((client) => {
            const c: any = client;
            const firm = FIRM_INFO[c.qboAccountType] ?? FIRM_INFO.ca_clients;
            const { primary, secondary } = splitClientName(client.name, c.company);
            const type = (c.clientType || "monthly") as keyof typeof CLIENT_TYPE_BADGE;
            const typeBadge = CLIENT_TYPE_BADGE[type] ?? CLIENT_TYPE_BADGE.monthly;
            const health = healthById.get(client.id);
            const missing = missingInfo(c);
            return (
              <Link key={client.id} to={`/client/${client.id}`}
                className="group block rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md hover:border-slate-300 transition-all">
                <div className="flex items-start gap-3">
                  {/* Logo (or monogram) avatar with a close-health dot */}
                  <div className="relative shrink-0">
                    <ClientAvatar id={client.id} name={primary} website={c.website} size="md" />
                    {health && <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white", TRAFFIC[health.status] ?? "bg-slate-300")} title={`Close status: ${health.status}`} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-slate-900 truncate leading-tight group-hover:text-lime-700">{primary}</h3>
                      <span className="shrink-0 text-sm" title={firm.label}>{firm.flag}</span>
                    </div>
                    {secondary && <p className="text-xs text-slate-400 truncate">{secondary}</p>}
                    <p className="text-xs text-slate-500 truncate mt-0.5">{INDUSTRIES[c.industry] ?? "📁 Other"}{c.province ? ` · ${c.province}` : ""}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 flex-wrap">
                  <Badge variant="outline" className={cn("text-[11px]", typeBadge.color)}>{typeBadge.label}</Badge>
                  {client.status !== "active" && <Badge variant="outline" className="text-[11px] capitalize bg-slate-50 text-slate-600 border-slate-200">{client.status}</Badge>}
                  {health && health.toReview > 0 && (
                    <Badge variant="outline" className="text-[11px] bg-purple-50 text-purple-700 border-purple-200">{health.toReview} to post</Badge>
                  )}
                  {missing.length > 0 && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-amber-600" title={`Missing: ${missing.join(", ")}`}>
                      <AlertTriangle className="h-3.5 w-3.5" />{missing.length}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        /* List / compact view */
        <Card>
          <CardContent className="p-0 divide-y divide-slate-100">
            {filtered.map((client) => {
              const c: any = client;
              const firm = FIRM_INFO[c.qboAccountType] ?? FIRM_INFO.ca_clients;
              const { primary, secondary } = splitClientName(client.name, c.company);
              const type = (c.clientType || "monthly") as keyof typeof CLIENT_TYPE_BADGE;
              const typeBadge = CLIENT_TYPE_BADGE[type] ?? CLIENT_TYPE_BADGE.monthly;
              const health = healthById.get(client.id);
              const missing = missingInfo(c);
              return (
                <Link key={client.id} to={`/client/${client.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                  <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", health ? TRAFFIC[health.status] ?? "bg-slate-300" : "bg-slate-200")} title={health ? `Close status: ${health.status}` : ""} />
                  <div className="shrink-0"><ClientAvatar id={client.id} name={primary} website={c.website} size="sm" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-800 truncate">{primary}</span>
                      <span className="text-xs shrink-0">{firm.flag}</span>
                    </div>
                    {secondary && <span className="text-xs text-slate-400 truncate block">{secondary}</span>}
                  </div>
                  <span className="hidden md:block text-xs text-slate-500 truncate w-40 shrink-0">{INDUSTRIES[c.industry] ?? "📁 Other"}</span>
                  <Badge variant="outline" className={cn("text-[11px] hidden sm:inline-flex", typeBadge.color)}>{typeBadge.label}</Badge>
                  {health && health.toReview > 0 && <Badge variant="outline" className="text-[11px] bg-purple-50 text-purple-700 border-purple-200 shrink-0">{health.toReview}</Badge>}
                  {missing.length > 0 && <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 shrink-0" title={`Missing: ${missing.join(", ")}`}><AlertTriangle className="h-3.5 w-3.5" />{missing.length}</span>}
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
