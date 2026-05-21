import { useState } from "react";
import { Plus, Search, Users, ArrowRight, Globe, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { Link } from "react-router";

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

const TABS = ["active", "inactive"] as const;

export default function Clients() {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const [firmFilter, setFirmFilter] = useState("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newClient, setNewClient] = useState({
    name: "", email: "", phone: "", company: "",
    status: "active" as "active" | "inactive",
    qboAccountType: "ca_clients" as "ca_clients" | "us_clients",
  });

  const { data: clients, isLoading } = trpc.crmClient.list.useQuery({
    search: search || undefined,
    status: tab,
  });

  const filtered = clients?.filter((c) => {
    if (firmFilter === "all") return true;
    return (c as any).qboAccountType === firmFilter;
  });

  const createClient = trpc.crmClient.create.useMutation({
    onSuccess: () => { utils.crmClient.list.invalidate(); setIsAddOpen(false); },
  });

  const activeCount = clients?.filter(c => c.workflowStatus === "active").length ?? 0;
  const inactiveCount = clients?.filter(c => c.workflowStatus === "inactive").length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 text-sm">Go Fig Bookz — {filtered?.length ?? 0} clients</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Client</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add New Client</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              {[
                { label: "Company Name *", key: "name", type: "text" },
                { label: "Email", key: "email", type: "email" },
                { label: "Phone", key: "phone", type: "text" },
              ].map(({ label, key, type }) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input type={type} value={(newClient as any)[key]}
                    onChange={(e) => setNewClient({ ...newClient, [key]: e.target.value })} />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label>Firm</Label>
                <Select value={newClient.qboAccountType}
                  onValueChange={(v) => setNewClient({ ...newClient, qboAccountType: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ca_clients">🇨🇦 Go Fig Bookz CA</SelectItem>
                    <SelectItem value="us_clients">🇺🇸 Go Fig Bookz US</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => createClient.mutate(newClient)}
                disabled={!newClient.name || createClient.isPending} className="w-full">
                {createClient.isPending ? "Creating..." : "Create Client"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
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
              {t === "active" ? activeCount : inactiveCount}
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
      </div>

      {/* Client Grid */}
      {isLoading ? (
        <div className="text-center py-20 text-slate-400">Loading clients...</div>
      ) : !filtered?.length ? (
        <div className="text-center py-20 text-slate-400">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No {tab} clients found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((client) => {
            const firm = FIRM_INFO[(client as any).qboAccountType] ?? FIRM_INFO.ca_clients;
            const industry = INDUSTRIES[(client as any).industry] ?? "📁 Other";
            return (
              <Card key={client.id} className="hover:shadow-md transition-shadow border border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate text-sm leading-tight">
                        {(client as any).company || client.name}
                      </h3>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{client.name}</p>
                    </div>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border ml-2 flex-shrink-0", firm.color)}>
                      {firm.flag}
                    </span>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{industry}</span>
                    </div>
                    {client.email && (
                      <div className="text-xs text-slate-500 truncate pl-5">{client.email}</div>
                    )}
                    {(client as any).province && (
                      <div className="text-xs text-slate-400 truncate pl-5">{(client as any).province}</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <Badge variant="outline" className={cn(
                      "text-xs capitalize",
                      c
