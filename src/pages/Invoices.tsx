import { useState } from "react";
import { Plus, Search, DollarSign, Clock, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Invoices() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data: invoicesList } = trpc.invoice.list.useQuery();
  const { data: stats } = trpc.invoice.stats.useQuery();
  const createInvoice = trpc.invoice.create.useMutation({ onSuccess: () => { utils.invoice.list.invalidate(); setIsAddOpen(false); } });
  const markPaid = trpc.invoice.markPaid.useMutation({ onSuccess: () => utils.invoice.list.invalidate() });

  const [newInvoice, setNewInvoice] = useState({ clientId: 1, invoiceNumber: "", amount: "", issueDate: "", dueDate: "", description: "" });

  const filteredInvoices = (invoicesList || []).filter(inv => {
    const matchesSearch = inv.invoiceNumber.toLowerCase().includes(search.toLowerCase());
    const matchesTab = activeTab === "all" || inv.status === activeTab;
    return matchesSearch && matchesTab;
  });

  const statusConfig = {
    draft: { label: "Draft", color: "bg-slate-100 text-slate-700" },
    sent: { label: "Sent", color: "bg-blue-100 text-blue-700" },
    paid: { label: "Paid", color: "bg-lime-100 text-lime-700" },
    overdue: { label: "Overdue", color: "bg-red-100 text-red-700" },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Invoices</h1><p className="text-slate-500">Manage billing and payments</p></div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Create Invoice</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Invoice #</Label><Input value={newInvoice.invoiceNumber} onChange={(e) => setNewInvoice({...newInvoice, invoiceNumber: e.target.value})} /></div>
                <div className="space-y-2"><Label>Amount *</Label><Input type="number" value={newInvoice.amount} onChange={(e) => setNewInvoice({...newInvoice, amount: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Issue Date</Label><Input type="date" value={newInvoice.issueDate} onChange={(e) => setNewInvoice({...newInvoice, issueDate: e.target.value})} /></div>
                <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={newInvoice.dueDate} onChange={(e) => setNewInvoice({...newInvoice, dueDate: e.target.value})} /></div>
              </div>
              <div className="space-y-2"><Label>Description</Label><Input value={newInvoice.description} onChange={(e) => setNewInvoice({...newInvoice, description: e.target.value})} /></div>
              <Button className="w-full" onClick={() => newInvoice.amount && newInvoice.issueDate && newInvoice.dueDate && createInvoice.mutate({...newInvoice, issueDate: new Date(newInvoice.issueDate), dueDate: new Date(newInvoice.dueDate)})}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><DollarSign className="h-5 w-5 text-lime-500" /><div><p className="text-sm text-slate-500">Revenue</p><p className="text-xl font-bold">${(stats?.totalRevenue ?? 0).toLocaleString()}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><Clock className="h-5 w-5 text-amber-500" /><div><p className="text-sm text-slate-500">Outstanding</p><p className="text-xl font-bold">${(stats?.outstanding ?? 0).toLocaleString()}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><FileText className="h-5 w-5 text-slate-500" /><div><p className="text-sm text-slate-500">Draft</p><p className="text-xl font-bold">{stats?.draft ?? 0}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><AlertCircle className="h-5 w-5 text-red-500" /><div><p className="text-sm text-slate-500">Overdue</p><p className="text-xl font-bold">{stats?.overdue ?? 0}</p></div></div></CardContent></Card>
      </div>

      <Card><CardContent className="p-4"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input placeholder="Search invoices..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} /></div></CardContent></Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5"><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="draft">Draft</TabsTrigger><TabsTrigger value="sent">Sent</TabsTrigger><TabsTrigger value="paid">Paid</TabsTrigger><TabsTrigger value="overdue">Overdue</TabsTrigger></TabsList>
        <TabsContent value={activeTab} className="mt-4">
          <div className="space-y-3">
            {filteredInvoices.map((inv) => {
              const cfg = statusConfig[inv.status as keyof typeof statusConfig] || statusConfig.draft;
              return (
                <Card key={inv.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", inv.status === "paid" ? "bg-lime-100" : inv.status === "overdue" ? "bg-red-100" : "bg-slate-100")}>
                          {inv.status === "paid" ? <CheckCircle className="h-5 w-5 text-lime-600" /> : <FileText className={cn("h-5 w-5", inv.status === "overdue" ? "text-red-600" : "text-slate-600")} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-slate-900">{inv.invoiceNumber}</h4>
                            <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
                          </div>
                          <p className="text-xs text-slate-400">Due: {format(new Date(inv.dueDate), "MMM d, yyyy")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xl font-bold text-slate-900">${parseFloat(inv.amount).toLocaleString()}</p>
                        </div>
                        {inv.status !== "paid" && <Button variant="outline" size="sm" onClick={() => markPaid.mutate({ id: inv.id })}>Mark Paid</Button>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
