import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Plus, Search, Filter, Phone, Mail, Users, LayoutDashboard, ArrowRight, Globe, Clock, Edit3, CheckCircle2, Send, FileText, UserCheck, Trash2, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(searchParams.get("status") || "all");
  const [showInactive, setShowInactive] = useState(false);
  const [firmFilter, setFirmFilter] = useState<string>("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editClient, setEditClient] = useState<any>(null);
  const [scheduleDiscovery, setScheduleDiscovery] = useState<{ open: boolean; clientId: number; clientName: string; date: string; time: string; meetingLink: string } | null>(null);

  const { data: clients, isLoading } = trpc.crmClient.list.useQuery(
    { search: search || undefined, status: status as "active" | "inactive" | "prospect" | "all" }
  );

  // Filter by firm client-side
  const filteredClients = clients?.filter((c) => {
    if (firmFilter === "all") return true;
    return (c as any).qboAccountType === firmFilter || (firmFilter === "ca_clients" && !(c as any).qboAccountType);
  }).filter((c) => {
    // Hide inactive by default unless showInactive is checked
    if (showInactive) return true;
    return c.status !== "inactive";
  });

  const createClient = trpc.crmClient.create.useMutation({
    onSuccess: () => {
      utils.crmClient.list.invalidate();
      setIsAddOpen(false);
    },
  });

  const updateClient = trpc.crmClient.update.useMutation({
    onSuccess: () => {
      utils.crmClient.list.invalidate();
      setEditClient(null);
    },
  });

  const sendQuote = trpc.crmClient.sendQuote.useMutation({
    onSuccess: () => utils.crmClient.list.invalidate(),
  });

  const approveQuote = trpc.crmClient.approveQuote.useMutation({
    onSuccess: () => utils.crmClient.list.invalidate(),
  });

  const sendEngagement = trpc.crmClient.sendEngagement.useMutation({
    onSuccess: () => utils.crmClient.list.invalidate(),
  });

  const signEngagement = trpc.crmClient.signEngagement.useMutation({
    onSuccess: () => utils.crmClient.list.invalidate(),
  });

  const archiveClient = trpc.crmClient.archive.useMutation({
    onSuccess: () => {
      utils.crmClient.list.invalidate();
      setEditClient(null);
    },
  });

  const deleteClient = trpc.crmClient.delete.useMutation({
    onSuccess: () => {
      utils.crmClient.list.invalidate();
      setEditClient(null);
    },
  });

  const createCalendarEvent = trpc.calendar.create.useMutation({
    onSuccess: () => {
      utils.calendar.list.invalidate();
      setScheduleDiscovery(null);
    },
  });

  const [newClient, setNewClient] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    address: "",
    status: "active" as "active" | "inactive" | "prospect" | "lead",
    qboAccountType: "ca_clients" as "ca_clients" | "us_clients" | "personal_business",
    assignedTo: "Markie" as "Markie" | "Rachelle",
    leadSource: "",
    leadSourceDetail: "",
    hasHST: false,
    hstNumber: "",
    hstPeriod: "quarterly" as "monthly" | "quarterly" | "annual",
    hasWSIB: false,
    wsibAccountNumber: "",
    wsibQuarter: "all" as "Q1" | "Q2" | "Q3" | "Q4" | "all",
    hasPayroll: false,
    payrollFrequency: "bi-weekly" as "weekly" | "bi-weekly" | "semi-monthly" | "monthly" | "self",
    yearEndMonth: "Dec" as "Jan" | "Feb" | "Mar" | "Apr" | "May" | "Jun" | "Jul" | "Aug" | "Sep" | "Oct" | "Nov" | "Dec",
    billingType: "monthly_fixed" as "monthly_fixed" | "annual_fixed" | "one_time_cleanup" | "hourly" | "project" | "hybrid",
    monthlyFee: 0,
    transactionsPerMonth: 0,
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
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add New Client / Lead</DialogTitle></DialogHeader>
            <div className="space-y-5 py-4">
              {/* Basic Info */}
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
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={newClient.address} onChange={(e) => setNewClient({...newClient, address: e.target.value})} placeholder="Street, City, Province, Postal" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={newClient.status} onValueChange={(v) => setNewClient({...newClient, status: v as any})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">🔥 Lead</SelectItem>
                      <SelectItem value="prospect">👋 Prospect</SelectItem>
                      <SelectItem value="active">✅ Active</SelectItem>
                      <SelectItem value="inactive">⏸️ Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assigned To</Label>
                  <Select value={newClient.assignedTo} onValueChange={(v) => setNewClient({...newClient, assignedTo: v as any})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Markie">Markie</SelectItem>
                      <SelectItem value="Rachelle">Rachelle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                <div className="space-y-2">
                  <Label>Year End</Label>
                  <Select value={newClient.yearEndMonth} onValueChange={(v) => setNewClient({...newClient, yearEndMonth: v as any})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Lead Source */}
              <div className="space-y-2">
                <Label>Lead Source</Label>
                <Input value={newClient.leadSource} onChange={(e) => setNewClient({...newClient, leadSource: e.target.value})} placeholder="e.g. Referral, Website, Cold Call" />
              </div>

              {/* HST Section */}
              <div className="space-y-3 border rounded-lg p-4 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Checkbox id="new-hst" checked={newClient.hasHST} onCheckedChange={(v) => setNewClient({...newClient, hasHST: v === true})} />
                  <Label htmlFor="new-hst" className="font-semibold text-slate-900">HST Filing</Label>
                </div>
                {newClient.hasHST && (
                  <div className="pl-6 space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">HST Number</Label>
                      <Input value={newClient.hstNumber} onChange={(e) => setNewClient({...newClient, hstNumber: e.target.value})} placeholder="e.g. 123456789RT0001" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Filing Period</Label>
                      <Select value={newClient.hstPeriod} onValueChange={(v) => setNewClient({...newClient, hstPeriod: v as any})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* WSIB Section */}
              <div className="space-y-3 border rounded-lg p-4 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Checkbox id="new-wsib" checked={newClient.hasWSIB} onCheckedChange={(v) => setNewClient({...newClient, hasWSIB: v === true})} />
                  <Label htmlFor="new-wsib" className="font-semibold text-slate-900">WSIB Filing</Label>
                </div>
                {newClient.hasWSIB && (
                  <div className="pl-6 space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">WSIB Account Number</Label>
                      <Input value={newClient.wsibAccountNumber} onChange={(e) => setNewClient({...newClient, wsibAccountNumber: e.target.value})} placeholder="e.g. 1234567" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Quarter(s)</Label>
                      <Select value={newClient.wsibQuarter} onValueChange={(v) => setNewClient({...newClient, wsibQuarter: v as any})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Quarters</SelectItem>
                          <SelectItem value="Q1">Q1 (Jan-Mar)</SelectItem>
                          <SelectItem value="Q2">Q2 (Apr-Jun)</SelectItem>
                          <SelectItem value="Q3">Q3 (Jul-Sep)</SelectItem>
                          <SelectItem value="Q4">Q4 (Oct-Dec)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* Payroll Section */}
              <div className="space-y-3 border rounded-lg p-4 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Checkbox id="new-payroll" checked={newClient.hasPayroll} onCheckedChange={(v) => setNewClient({...newClient, hasPayroll: v === true})} />
                  <Label htmlFor="new-payroll" className="font-semibold text-slate-900">Payroll</Label>
                </div>
                {newClient.hasPayroll && (
                  <div className="pl-6 space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Payroll Frequency</Label>
                      <Select value={newClient.payrollFrequency} onValueChange={(v) => setNewClient({...newClient, payrollFrequency: v as any})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="bi-weekly">Bi-Weekly</SelectItem>
                          <SelectItem value="semi-monthly">Semi-Monthly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="self">Self-Only (Owner)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* Fee Structure */}
              <div className="space-y-3 border rounded-lg p-4 bg-slate-50/50">
                <Label className="font-semibold text-slate-900">Fee Structure</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Fee Type</Label>
                    <Select value={newClient.billingType} onValueChange={(v) => setNewClient({...newClient, billingType: v as any})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly_fixed">Monthly Fixed</SelectItem>
                        <SelectItem value="annual_fixed">Annual Fixed</SelectItem>
                        <SelectItem value="one_time_cleanup">One-Time Cleanup</SelectItem>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="project">Project</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Amount ($)</Label>
                    <Input type="number" value={newClient.monthlyFee || ""} onChange={(e) => setNewClient({...newClient, monthlyFee: parseFloat(e.target.value) || 0})} placeholder="e.g. 500" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Transactions/Month</Label>
                  <Input type="number" value={newClient.transactionsPerMonth || ""} onChange={(e) => setNewClient({...newClient, transactionsPerMonth: parseInt(e.target.value) || 0})} placeholder="e.g. 50" />
                  <p className="text-[10px] text-slate-400">Used for catch-up/annual fee calculation. 20% off regular monthly rate.</p>
                </div>
              </div>

              <Button onClick={handleSubmit} disabled={createClient.isPending} className="w-full">
                {createClient.isPending ? "Creating..." : `Create ${newClient.status === 'lead' ? 'Lead' : 'Client'}`}
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
              <SelectItem value="lead">🔥 Leads</SelectItem>
              <SelectItem value="prospect">👋 Prospects</SelectItem>
              <SelectItem value="active">✅ Active</SelectItem>
              <SelectItem value="inactive">⏸️ Inactive</SelectItem>
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
          <label className="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-slate-50 text-sm">
            <Checkbox checked={showInactive} onCheckedChange={(v) => setShowInactive(v === true)} />
            <span className="text-slate-600">Show Inactive</span>
          </label>
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
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(client as any).hasHST && (
                      <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]">
                        HST
                      </Badge>
                    )}
                    {(client as any).hasWSIB && (
                      <Badge className="bg-orange-50 text-orange-700 border-orange-200 text-[10px]">
                        WSIB
                      </Badge>
                    )}
                    {(client as any).hasPayroll && (
                      <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px]">
                        Payroll
                      </Badge>
                    )}
                    {(client as any).quoteSentAt && !(client as any).quoteApprovedAt && (
                      <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 text-[10px]">
                        Quote Sent
                      </Badge>
                    )}
                    {(client as any).quoteApprovedAt && (
                      <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                        Quote Approved
                      </Badge>
                    )}
                    {(client as any).engagementSentAt && !(client as any).engagementSignedAt && (
                      <Badge className="bg-pink-50 text-pink-700 border-pink-200 text-[10px]">
                        Engagement Sent
                      </Badge>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className={cn(
                        client.status === "active" ? "bg-lime-50 text-lime-700 border-lime-200" :
                        client.status === "lead" ? "bg-pink-50 text-pink-700 border-pink-200" :
                        client.status === "prospect" ? "bg-blue-50 text-blue-700 border-blue-200" :
                        "bg-slate-50 text-slate-700 border-slate-200"
                      )}>
                        {client.status === "lead" ? "🔥 lead" : client.status}
                      </Badge>
                      <span className="text-[10px] text-slate-400">
                        {(client as any).workflowStatus || "new_lead"}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {/* LEAD WORKFLOW ACTIONS */}
                      {client.status === "lead" && (
                        <>
                          {(client as any).workflowStatus === "new_lead" || !(client as any).workflowStatus ? (
                            <>
                              <Link to={`/discovery?clientId=${client.id}`}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-purple-600 border-purple-300 hover:bg-purple-50"
                                >
                                  <Phone className="h-3.5 w-3.5 mr-1" />
                                  Discovery Call
                                </Button>
                              </Link>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-indigo-600 border-indigo-300 hover:bg-indigo-50"
                                onClick={() => setScheduleDiscovery({ 
                                  open: true, 
                                  clientId: client.id, 
                                  clientName: client.name,
                                  date: format(new Date(), "yyyy-MM-dd"),
                                  time: "10:00",
                                  meetingLink: ""
                                })}
                              >
                                <CalendarDays className="h-3.5 w-3.5 mr-1" />
                                Schedule
                              </Button>
                            </>
                          ) : (client as any).workflowStatus === "discovery_call" || !(client as any).quoteSentAt ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-amber-600 border-amber-300 hover:bg-amber-50"
                              onClick={() => {
                                sendQuote.mutate({ id: client.id, amount: (client as any).monthlyFee || 0 });
                              }}
                            >
                              <Send className="h-3.5 w-3.5 mr-1" />
                              Send Quote
                            </Button>
                          ) : (client as any).workflowStatus === "quote_sent" || !(client as any).quoteApprovedAt ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-blue-600 border-blue-300 hover:bg-blue-50"
                              onClick={() => {
                                approveQuote.mutate({ id: client.id });
                              }}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              Approve Quote
                            </Button>
                          ) : (client as any).workflowStatus === "quote_approved" || !(client as any).engagementSentAt ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-pink-600 border-pink-300 hover:bg-pink-50"
                              onClick={() => {
                                sendEngagement.mutate({ id: client.id });
                              }}
                            >
                              <FileText className="h-3.5 w-3.5 mr-1" />
                              Send Engagement
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-lime-600 border-lime-300 hover:bg-lime-50"
                              onClick={() => {
                                updateClient.mutate({
                                  id: client.id,
                                  data: {
                                    status: "active",
                                    workflowStatus: "active"
                                  }
                                });
                              }}
                            >
                              <UserCheck className="h-3.5 w-3.5 mr-1" />
                              Convert to Client
                            </Button>
                          )}
                        </>
                      )}
                      <Button variant="ghost" size="sm" className="text-slate-400 hover:text-lime-600 hover:bg-lime-50" onClick={() => setEditClient({...client, _originalHasHST: client.hasHST, _originalHasWSIB: client.hasWSIB, _originalHasPayroll: client.hasPayroll})}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-600 hover:bg-red-50" onClick={() => {
                        if (confirm(`Delete ${client.name}? This cannot be undone.`)) {
                          deleteClient.mutate({ id: client.id });
                        }
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Link to={`/client/${client.id}`}>
                        <Button variant="ghost" size="sm" className="text-lime-600 hover:text-lime-700 hover:bg-lime-50">
                          <LayoutDashboard className="h-4 w-4 mr-1" />
                          Dashboard
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => {
                          const email = client.email || (client.contactInfo ? JSON.parse(client.contactInfo).email : '');
                          const subject = encodeURIComponent(`Re: ${client.name} - Go Fig Bookkeeping`);
                          window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${subject}`, '_blank');
                        }}
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        Draft Email
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Client Dialog */}
      <Dialog open={!!editClient} onOpenChange={(open) => !open && setEditClient(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Client - {editClient?.name}</DialogTitle></DialogHeader>
          {editClient && (
            <div className="space-y-5 py-4">
              {/* HST Section */}
              <div className="space-y-3 border rounded-lg p-4 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-hst"
                    checked={editClient.hasHST ?? false}
                    onCheckedChange={(v) => setEditClient({...editClient, hasHST: v === true})}
                  />
                  <Label htmlFor="edit-hst" className="font-semibold text-slate-900">
                    HST Filing
                  </Label>
                </div>
                {editClient.hasHST && (
                  <div className="pl-6 space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">HST Number</Label>
                      <Input
                        value={editClient.hstNumber || ""}
                        onChange={(e) => setEditClient({...editClient, hstNumber: e.target.value})}
                        placeholder="e.g. 123456789RT0001"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Filing Period</Label>
                      <Select
                        value={editClient.hstPeriod || "quarterly"}
                        onValueChange={(v) => setEditClient({...editClient, hstPeriod: v})}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* WSIB Section */}
              <div className="space-y-3 border rounded-lg p-4 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-wsib"
                    checked={editClient.hasWSIB ?? false}
                    onCheckedChange={(v) => setEditClient({...editClient, hasWSIB: v === true})}
                  />
                  <Label htmlFor="edit-wsib" className="font-semibold text-slate-900">
                    WSIB Filing
                  </Label>
                </div>
                {editClient.hasWSIB && (
                  <div className="pl-6 space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">WSIB Account Number</Label>
                      <Input
                        value={editClient.wsibAccountNumber || ""}
                        onChange={(e) => setEditClient({...editClient, wsibAccountNumber: e.target.value})}
                        placeholder="e.g. 1234567"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Quarter(s)</Label>
                      <Select
                        value={editClient.wsibQuarter || "all"}
                        onValueChange={(v) => setEditClient({...editClient, wsibQuarter: v})}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Quarters</SelectItem>
                          <SelectItem value="Q1">Q1 (Jan-Mar)</SelectItem>
                          <SelectItem value="Q2">Q2 (Apr-Jun)</SelectItem>
                          <SelectItem value="Q3">Q3 (Jul-Sep)</SelectItem>
                          <SelectItem value="Q4">Q4 (Oct-Dec)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* Payroll Section */}
              <div className="space-y-3 border rounded-lg p-4 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-payroll"
                    checked={editClient.hasPayroll ?? false}
                    onCheckedChange={(v) => setEditClient({...editClient, hasPayroll: v === true})}
                  />
                  <Label htmlFor="edit-payroll" className="font-semibold text-slate-900">
                    Payroll
                  </Label>
                </div>
                {editClient.hasPayroll && (
                  <div className="pl-6 space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Payroll Frequency</Label>
                      <Select
                        value={editClient.payrollFrequency || "bi-weekly"}
                        onValueChange={(v) => setEditClient({...editClient, payrollFrequency: v})}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="bi-weekly">Bi-Weekly</SelectItem>
                          <SelectItem value="semi-monthly">Semi-Monthly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="self">Self-Only (Owner)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* Year End */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Year End Month</Label>
                <Select
                  value={editClient.yearEndMonth || "Dec"}
                  onValueChange={(v) => setEditClient({...editClient, yearEndMonth: v})}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Fee Structure */}
              <div className="space-y-3 border rounded-lg p-4 bg-slate-50/50">
                <Label className="font-semibold text-slate-900">Fee Structure</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Fee Type</Label>
                    <Select
                      value={editClient.billingType || "monthly_fixed"}
                      onValueChange={(v) => setEditClient({...editClient, billingType: v})}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly_fixed">Monthly Fixed</SelectItem>
                        <SelectItem value="annual_fixed">Annual Fixed</SelectItem>
                        <SelectItem value="one_time_cleanup">One-Time Cleanup</SelectItem>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="project">Project</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Amount ($)</Label>
                    <Input
                      type="number"
                      value={editClient.monthlyFee || ""}
                      onChange={(e) => setEditClient({...editClient, monthlyFee: parseFloat(e.target.value) || 0})}
                      placeholder="e.g. 500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Transactions/Month (for catch-ups & annuals)</Label>
                  <Input
                    type="number"
                    value={(editClient as any).transactionsPerMonth || ""}
                    onChange={(e) => setEditClient({...editClient, transactionsPerMonth: parseInt(e.target.value) || 0})}
                    placeholder="e.g. 50"
                  />
                  <p className="text-[10px] text-slate-400">
                    Used to calculate catch-up/annual fees. 20% off regular monthly rate.
                  </p>
                </div>
              </div>

              {/* Quote Section */}
              <div className="space-y-3 border rounded-lg p-4 bg-slate-50/50">
                <Label className="font-semibold text-slate-900">Quote & Engagement</Label>

                {/* Send Quote */}
                {!(editClient as any).quoteSentAt && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={(editClient as any)._quoteAmount || ""}
                        onChange={(e) => setEditClient({...editClient, _quoteAmount: e.target.value})}
                        placeholder="Quote amount"
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const amount = parseFloat((editClient as any)._quoteAmount);
                          if (amount > 0) {
                            sendQuote.mutate({ id: editClient.id, amount });
                          }
                        }}
                      >
                        Send Quote
                      </Button>
                    </div>
                  </div>
                )}

                {/* Quote Sent - show approve button */}
                {(editClient as any).quoteSentAt && !(editClient as any).quoteApprovedAt && (
                  <div className="flex items-center justify-between bg-yellow-50 p-2 rounded border border-yellow-200">
                    <span className="text-sm text-yellow-800">
                      Quote sent: ${(editClient as any).quoteAmount}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-green-600 border-green-300 hover:bg-green-50"
                      onClick={() => approveQuote.mutate({ id: editClient.id })}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                  </div>
                )}

                {/* Quote Approved - show engagement button */}
                {(editClient as any).quoteApprovedAt && !(editClient as any).engagementSentAt && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => sendEngagement.mutate({ id: editClient.id })}
                  >
                    Generate Engagement Letter
                  </Button>
                )}

                {/* Engagement Sent - show sign button */}
                {(editClient as any).engagementSentAt && !(editClient as any).engagementSignedAt && (
                  <div className="flex items-center justify-between bg-pink-50 p-2 rounded border border-pink-200">
                    <span className="text-sm text-pink-800">
                      Engagement sent
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-green-600 border-green-300 hover:bg-green-50"
                      onClick={() => signEngagement.mutate({ id: editClient.id })}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Signed
                    </Button>
                  </div>
                )}

                {/* Engagement Signed */}
                {(editClient as any).engagementSignedAt && (
                  <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded border border-green-200">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm">Engagement signed - ready for onboarding</span>
                  </div>
                )}
              </div>

              {/* Archive / Delete */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 text-orange-600 border-orange-300 hover:bg-orange-50"
                  onClick={() => {
                    if (confirm("Archive this client? They will be hidden from active view.")) {
                      archiveClient.mutate({ id: editClient.id });
                    }
                  }}
                >
                  Archive
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => {
                    if (confirm("DELETE this client permanently? This cannot be undone.")) {
                      deleteClient.mutate({ id: editClient.id });
                    }
                  }}
                >
                  Delete
                </Button>
              </div>

              <Button
                className="w-full"
                disabled={updateClient.isPending}
                onClick={() => {
                  updateClient.mutate({
                    id: editClient.id,
                    hasHST: editClient.hasHST,
                    hstNumber: editClient.hstNumber,
                    hstPeriod: editClient.hstPeriod,
                    hasWSIB: editClient.hasWSIB,
                    wsibAccountNumber: editClient.wsibAccountNumber,
                    wsibQuarter: editClient.wsibQuarter,
                    hasPayroll: editClient.hasPayroll,
                    payrollFrequency: editClient.payrollFrequency,
                    yearEndMonth: editClient.yearEndMonth,
                    billingType: editClient.billingType,
                    monthlyFee: editClient.monthlyFee,
                    transactionsPerMonth: (editClient as any).transactionsPerMonth,
                  });
                }}
              >
                {updateClient.isPending ? "Saving..." : "Save & Create Tasks"}
              </Button>
              <p className="text-xs text-slate-500 text-center">
                {editClient.hasHST && !editClient._originalHasHST && "→ Will create HST filing task"}
                {editClient.hasWSIB && !editClient._originalHasWSIB && " → Will create WSIB filing task"}
                {editClient.hasPayroll && !editClient._originalHasPayroll && " → Will create payroll remittance task"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Schedule Discovery Dialog */}
      <Dialog 
        open={!!scheduleDiscovery} 
        onOpenChange={() => setScheduleDiscovery(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-purple-500" />
              Schedule Discovery Call
            </DialogTitle>
          </DialogHeader>
          {scheduleDiscovery && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm font-medium text-purple-800">{scheduleDiscovery.clientName}</p>
                <p className="text-xs text-purple-600">Discovery Call with {scheduleDiscovery.clientName}</p>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input 
                  type="date" 
                  value={scheduleDiscovery.date}
                  onChange={(e) => setScheduleDiscovery({ ...scheduleDiscovery, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input 
                  type="time" 
                  value={scheduleDiscovery.time}
                  onChange={(e) => setScheduleDiscovery({ ...scheduleDiscovery, time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Meeting Link</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Google Meet link or phone number..."
                    value={scheduleDiscovery.meetingLink || ''}
                    onChange={(e) => setScheduleDiscovery({ ...scheduleDiscovery, meetingLink: e.target.value })}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-blue-600 border-blue-300 hover:bg-blue-50 whitespace-nowrap"
                    onClick={() => {
                      // Generate a random Google Meet-style link
                      const meetId = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
                      setScheduleDiscovery({ ...scheduleDiscovery, meetingLink: `https://meet.google.com/${meetId.substring(0, 3)}-${meetId.substring(3, 7)}-${meetId.substring(7, 10)}` });
                    }}
                  >
                    Generate Meet
                  </Button>
                </div>
                <p className="text-xs text-slate-500">Click "Generate Meet" for an auto-generated link</p>
              </div>
              <Button 
                className="w-full bg-purple-500 hover:bg-purple-600"
                onClick={() => {
                  const startDate = new Date(`${scheduleDiscovery.date}T${scheduleDiscovery.time}`);
                  const endDate = new Date(startDate.getTime() + 30 * 60000); // 30 min default
                  createCalendarEvent.mutate({
                    title: `Discovery Call: ${scheduleDiscovery.clientName}`,
                    description: `Discovery call with lead ${scheduleDiscovery.clientName}. Click to open discovery form: /discovery?clientId=${scheduleDiscovery.clientId}`,
                    startDate,
                    endDate,
                    clientId: scheduleDiscovery.clientId,
                    color: "purple",
                    location: scheduleDiscovery.meetingLink || "Google Meet",
                    meetingLink: scheduleDiscovery.meetingLink,
                  });
                }}
              >
                <CalendarDays className="h-4 w-4 mr-2" />
                Create Calendar Event
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
