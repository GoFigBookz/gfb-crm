import { useState } from "react";
import { Plus, Search, Filter, Phone, Mail, Users, LayoutDashboard, ArrowRight, Globe, Clock } from "lucide-react";
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
import { format } from "date-fns";

const FIRM_FLAGS: Record<string, { flag: string; label: string; color: string }> = {
  ca_clients: { flag: "🇨🇦", label: "Canada", color: "bg-red-50 text-red-700 border-red-200" },
  us_clients: { flag: "🇺🇸", label: "USA", color: "bg-blue-50 text-blue-700 border-blue-200" },
  personal_business: { flag: "🏢", label: "Personal", color: "bg-slate-50 text-slate-700 border-slate-200" },
};

export default function Clients() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [firmFilter, setFirmFilter] = useState<string>("all");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data: clients, isLoading } = trpc.crmClient.list.useQuery(
    { search: search || undefined, status: status as "active" | "inactive" | "prospect" | "all" }
  );

  // Filter by firm client-side (since qboAccountType is on the client record)
  const filteredClients = clients?.filter((c) => {
    if (firmFilter === "all") return true;
    return (c as any).qboAccountType === firmFilter || (firmFilter === "ca_clients" && !(c as any).qboAccountType);
  });

  const createClient = trpc.crmClient.create.useMutation({
    onSuccess: () => {
      utils.crmClient.list.invalidate();
      setIsAddOpen(false);
    },
  });

  const [newClient, setNewClient] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    status: "active" as "active" | "inactive" | "prospect",
    qboAccountType: "ca_clients" as "ca_clients" | "us_clients" | "personal_business",
  });

  const handleSubmit = () => {
    if (!newClient.name || !newClient.email) return;
    createClient.mutate(newClient);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500">Manage your client relationships</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add Client</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add New Client</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={newClient.name} onChange={(e) => setNewClient({...newClient, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={newClient.email} onChange={(e) => setNewClient({...newClient, email: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={newClient.phone} onChange={(e) => setNewClient({...newClient, phone: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Input value={newClient.company} onChange={(e) => setNewClient({...newClient, company: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={newClient.status} onValueChange={(v) => setNewClient({...newClient, status: v as any})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="prospect">Prospect</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>QBO Firm</Label>
                  <Select value={newClient.qboAccountType} onValueChange={(v) => setNewClient({...newClient, qboAccountType: v as any})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ca_clients">🇨🇦 Go Fig Books Inc</SelectItem>
                      <SelectItem value="us_clients">🇺🇸 Go Fig Books USA</SelectItem>
                      <SelectItem value="personal_business">🏢 Personal Business</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleSubmit} disabled={createClient.isPending} className="w-full">
                {createClient.isPending ? "Creating..." : "Create Client"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4 flex gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search clients..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px]"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
            </SelectContent>
          </Select>
          <Select value={firmFilter} onValueChange={setFirmFilter}>
            <SelectTrigger className="w-[200px]"><Globe className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Firms</SelectItem>
              <SelectItem value="ca_clients">🇨🇦 Go Fig Books Inc</SelectItem>
              <SelectItem value="us_clients">🇺🇸 Go Fig Books USA</SelectItem>
              <SelectItem value="personal_business">🏢 Personal Business</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400">Loading clients...</div>
      ) : !filteredClients || filteredClients.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-16 w-16 mx-auto mb-4 text-slate-300" />
          <p className="text-slate-500">No clients found matching your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((client) => {
            const firm = FIRM_FLAGS[(client as any).qboAccountType || "ca_clients"];
            return (
              <Card key={client.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-lime-400 to-blue-500 flex items-center justify-center text-white font-semibold">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{client.name}</p>
                      <p className="text-xs text-slate-500">{client.company || "No company"}</p>
                    </div>
                    {firm && (
                      <Badge variant="outline" className={cn("text-xs", firm.color)} title={firm.label}>
                        {firm.flag}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <span className="truncate">{client.email}</span>
                    </div>
                    {client.phone && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Phone className="h-4 w-4 text-slate-400" />
                        <span>{client.phone}</span>
                      </div>
                    )}
                    {(client as any).lastContactedAt && (
                      <div className="flex items-center gap-2 text-slate-500">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-xs">
                          Last contact: {format(new Date((client as any).lastContactedAt), "MMM d")}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t flex items-center justify-between">
                    <Badge variant="outline" className={cn(
                      client.status === "active" ? "bg-lime-50 text-lime-700 border-lime-200" :
                      client.status === "prospect" ? "bg-blue-50 text-blue-700 border-blue-200" :
                      "bg-slate-50 text-slate-700 border-slate-200"
                    )}>
                      {client.status}
                    </Badge>
                    <Link to={`/client/${client.id}`}>
                      <Button variant="ghost" size="sm" className="text-lime-600 hover:text-lime-700 hover:bg-lime-50">
                        <LayoutDashboard className="h-4 w-4 mr-1" />
                        Dashboard
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
