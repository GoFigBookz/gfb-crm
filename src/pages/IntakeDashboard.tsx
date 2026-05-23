import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Shield, CheckCircle, AlertTriangle, AlertCircle, Clock,
  RefreshCw, Mail, Link2, Brain, Landmark, ChevronRight,
  XCircle, TrendingUp, BarChart3, FileText, CheckSquare,
  Bot, Activity, Zap, Inbox, ExternalLink, Filter, Building2,
  DollarSign, CalendarDays, Hash,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ─── Types ─── */
interface IntakeItem {
  id: number;
  makeId: string | null;
  clientName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  subject: string | null;
  amount: number | null;
  vendor: string | null;
  documentType: string | null;
  fileUrl: string | null;
  status: string;
  notes: string | null;
  assignedClientId: number | null;
  rawPayload: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ─── Helpers ─── */
const STATUS_STYLES: Record<string, string> = {
  new: "bg-sky-100 text-sky-700 border-sky-200",
  reviewed: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
  posted: "bg-violet-100 text-violet-700 border-violet-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  new: <Inbox className="w-4 h-4" />,
  reviewed: <CheckSquare className="w-4 h-4" />,
  approved: <CheckCircle className="w-4 h-4" />,
  rejected: <XCircle className="w-4 h-4" />,
  posted: <Zap className="w-4 h-4" />,
};

/* ─── Dashboard ─── */
export default function IntakeDashboard() {
  const { user, can } = useAuth();
  const [filter, setFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: stats, isLoading: statsLoading } = trpc.makeIntake.stats.useQuery();
  const { data: items, isLoading, refetch } = trpc.makeIntake.list.useQuery(
    filter ? { status: filter as any, limit: 50, offset: 0 } : { limit: 50, offset: 0 }
  );
  const { data: clients } = trpc.crmClient.list.useQuery();
  const sheetPull = trpc.makeIntake.pollFromSheet.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Pulled ${data.imported} rows from sheet`);
        refetch();
      } else {
        toast.error(data.error || "Failed to pull from sheet");
      }
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.makeIntake.update.useMutation({
    onSuccess: () => { refetch(); toast.success("Updated"); },
  });

  const isAdmin = can("admin");

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const bulkAction = (status: string) => {
    selected.forEach((id) => updateMutation.mutate({ id, status: status as any }));
    setSelected(new Set());
  };

  const assignClient = (id: number, clientId: number | null) => {
    updateMutation.mutate({ id, assignedClientId: clientId ?? undefined });
  };

  const formatCurrency = (n: number | null) => {
    if (n == null) return "—";
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
  };

  const parsePayload = (raw: string | null) => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Inbox className="w-6 h-6 text-slate-700" />
            Intake Queue
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Make.com form submissions — review, assign, and approve.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => sheetPull.mutate()}>
            <RefreshCw className={cn("w-4 h-4 mr-1", sheetPull.isPending && "animate-spin")} />
            {sheetPull.isPending ? "Pulling..." : "Pull from Sheet"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="animate-pulse h-24 bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-4">
          <StatCard label="Total" value={stats?.total || 0} icon={<BarChart3 className="w-5 h-5" />} color="slate" />
          <StatCard label="New" value={stats?.new || 0} icon={<Inbox className="w-5 h-5" />} color="sky" active={filter === "new"} onClick={() => setFilter(filter === "new" ? null : "new")} />
          <StatCard label="Reviewed" value={stats?.reviewed || 0} icon={<CheckSquare className="w-5 h-5" />} color="amber" active={filter === "reviewed"} onClick={() => setFilter(filter === "reviewed" ? null : "reviewed")} />
          <StatCard label="Approved" value={stats?.approved || 0} icon={<CheckCircle className="w-5 h-5" />} color="emerald" active={filter === "approved"} onClick={() => setFilter(filter === "approved" ? null : "approved")} />
          <StatCard label="Rejected" value={stats?.rejected || 0} icon={<XCircle className="w-5 h-5" />} color="rose" active={filter === "rejected"} onClick={() => setFilter(filter === "rejected" ? null : "rejected")} />
        </div>
      )}

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-lg border">
          <span className="text-sm font-medium text-slate-700">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => bulkAction("reviewed")}>Mark Reviewed</Button>
          <Button size="sm" variant="outline" onClick={() => bulkAction("approved")}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => bulkAction("posted")}>Mark Posted</Button>
          <Button size="sm" variant="outline" className="text-rose-600" onClick={() => bulkAction("rejected")}>Reject</Button>
        </div>
      )}

      {/* Items List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items?.length === 0 ? (
        <Card className="p-12 text-center">
          <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-700">No intake items</h3>
          <p className="text-sm text-slate-500 mt-1">
            Click "Pull from Sheet" to load data from the Google Sheet.
            <br />
            <span className="text-xs text-slate-400">Sheet: 1lDtTggtV6YnGENYPXEZXng6gV2wclADGUgKqntWnql8</span>
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items?.map((item: IntakeItem) => (
            <IntakeCard
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onSelect={() => toggleSelect(item.id)}
              onStatusChange={(s) => updateMutation.mutate({ id: item.id, status: s as any })}
              onAssign={(cid) => assignClient(item.id, cid)}
              clients={clients || []}
              isAdmin={isAdmin}
              formatCurrency={formatCurrency}
              parsePayload={parsePayload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */
function StatCard({ label, value, icon, color, active, onClick }: {
  label: string; value: number; icon: React.ReactNode;
  color: string; active?: boolean; onClick?: () => void;
}) {
  const colorMap: Record<string, string> = {
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    sky: "bg-sky-50 border-sky-200 text-sky-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
  };
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        colorMap[color] || colorMap.slate,
        active && "ring-2 ring-offset-1 ring-slate-400"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs font-medium opacity-80">{label}</p>
        </div>
        <div className="opacity-60">{icon}</div>
      </CardContent>
    </Card>
  );
}

function IntakeCard({
  item, selected, onSelect, onStatusChange, onAssign, clients, isAdmin,
  formatCurrency, parsePayload,
}: {
  item: IntakeItem;
  selected: boolean;
  onSelect: () => void;
  onStatusChange: (s: string) => void;
  onAssign: (cid: number | null) => void;
  clients: any[];
  isAdmin: boolean;
  formatCurrency: (n: number | null) => string;
  parsePayload: (raw: string | null) => any;
}) {
  const [expanded, setExpanded] = useState(false);
  const payload = parsePayload(item.rawPayload);

  return (
    <Card className={cn("transition-all", expanded && "ring-1 ring-slate-200")}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={selected}
            onCheckedChange={onSelect}
            className="mt-1"
          />
          
          <div className="flex-1 min-w-0">
            {/* Top row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn("font-medium", STATUS_STYLES[item.status])}>
                  {STATUS_ICONS[item.status]} <span className="ml-1">{item.status}</span>
                </Badge>
                
                {item.clientName && (
                  <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" /> {item.clientName}
                  </span>
                )}
                
                {item.amount != null && (
                  <span className="text-sm font-semibold text-slate-800">
                    {formatCurrency(item.amount)}
                  </span>
                )}
                
                {item.vendor && (
                  <span className="text-xs text-slate-500">via {item.vendor}</span>
                )}
              </div>
              
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
            </div>
            
            {/* Subject / description */}
            {item.subject && (
              <p className="text-sm text-slate-700 mt-1 font-medium">{item.subject}</p>
            )}
            
            {/* Contact info */}
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
              {item.contactName && <span>👤 {item.contactName}</span>}
              {item.email && <span>✉️ {item.email}</span>}
              {item.phone && <span>📞 {item.phone}</span>}
              {item.documentType && <span>📄 {item.documentType}</span>}
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => onStatusChange("reviewed")}>
                <CheckSquare className="w-3.5 h-3.5 mr-1" /> Reviewed
              </Button>
              <Button size="sm" variant="outline" className="text-emerald-600" onClick={() => onStatusChange("approved")}>
                <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
              </Button>
              <Button size="sm" variant="outline" className="text-violet-600" onClick={() => onStatusChange("posted")}>
                <Zap className="w-3.5 h-3.5 mr-1" /> Posted
              </Button>
              <Button size="sm" variant="outline" className="text-rose-600" onClick={() => onStatusChange("rejected")}>
                <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
              </Button>
              
              {isAdmin && clients.length > 0 && (
                <select
                  className="text-xs border rounded px-2 py-1 bg-white"
                  value={item.assignedClientId || ""}
                  onChange={(e) => onAssign(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">Assign client…</option>
                  {clients.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              
              <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
                {expanded ? "Less" : "Raw"}
              </Button>
              
              {item.fileUrl && (
                <a
                  href={item.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-sky-600 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" /> File
                </a>
              )}
            </div>
            
            {/* Expanded raw payload */}
            {expanded && payload && (
              <pre className="mt-3 text-xs bg-slate-50 p-3 rounded overflow-auto max-h-60">
                {JSON.stringify(payload, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
