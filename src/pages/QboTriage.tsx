import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CheckCircle, XCircle, Filter, ArrowRight, Building2, FileText, CreditCard } from "lucide-react";

export default function QboTriagePage() {
  const utils = trpc.useUtils();
  const [selectedConnection, setSelectedConnection] = useState<string>("all");
  const [selectedInvoices, setSelectedInvoices] = useState<Set<number>>(new Set());
  const [selectedPayments, setSelectedPayments] = useState<Set<number>>(new Set());
  const [mapClientId, setMapClientId] = useState<string>("");

  // Fetch QBO connections
  const { data: connections } = trpc.qbo.listConnections.useQuery();

  // Fetch pending review items
  const { data: pendingData, refetch } = trpc.qbo.getPendingReview.useQuery({
    connectionId: selectedConnection === "all" ? undefined : parseInt(selectedConnection),
    entityType: "all",
  });

  // Fetch CRM clients for mapping
  const { data: crmClients } = trpc.crmClient.list.useQuery();

  // Fetch suggested matches
  const { data: suggestions } = trpc.qbo.suggestClientMatches.useQuery(undefined, {
    enabled: !!pendingData && (pendingData.invoices?.length > 0 || pendingData.payments?.length > 0),
  });

  const approveMutation = trpc.qbo.approveItems.useMutation({
    onSuccess: () => {
      toast.success("Items approved and posted");
      setSelectedInvoices(new Set());
      setSelectedPayments(new Set());
      utils.qbo.getPendingReview.invalidate();
    },
  });

  const rejectMutation = trpc.qbo.rejectItems.useMutation({
    onSuccess: () => {
      toast.success("Items rejected");
      setSelectedInvoices(new Set());
      setSelectedPayments(new Set());
      utils.qbo.getPendingReview.invalidate();
    },
  });

  const mapMutation = trpc.qbo.mapQboCustomerToClient.useMutation({
    onSuccess: () => {
      toast.success("Customer mapped to client");
      utils.qbo.getPendingReview.invalidate();
      utils.qbo.suggestClientMatches.invalidate();
    },
  });

  const toggleInvoice = (id: number) => {
    const next = new Set(selectedInvoices);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedInvoices(next);
  };

  const togglePayment = (id: number) => {
    const next = new Set(selectedPayments);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPayments(next);
  };

  const handleApprove = () => {
    if (selectedInvoices.size === 0 && selectedPayments.size === 0) {
      toast.error("Select items to approve");
      return;
    }
    approveMutation.mutate({
      invoiceIds: selectedInvoices.size > 0 ? [...selectedInvoices] : undefined,
      paymentIds: selectedPayments.size > 0 ? [...selectedPayments] : undefined,
      clientId: mapClientId ? parseInt(mapClientId) : undefined,
    });
  };

  const handleReject = () => {
    if (selectedInvoices.size === 0 && selectedPayments.size === 0) {
      toast.error("Select items to reject");
      return;
    }
    rejectMutation.mutate({
      invoiceIds: selectedInvoices.size > 0 ? [...selectedInvoices] : undefined,
      paymentIds: selectedPayments.size > 0 ? [...selectedPayments] : undefined,
    });
  };

  const allInvoices = pendingData?.invoices || [];
  const allPayments = pendingData?.payments || [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">QBO Review Queue</h1>
          <p className="text-muted-foreground">Review and post items pulled from QuickBooks</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedConnection} onValueChange={setSelectedConnection}>
            <SelectTrigger className="w-[220px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by QBO account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All QBO Accounts</SelectItem>
              {connections?.map((conn) => (
                <SelectItem key={conn.id} value={String(conn.id)}>
                  {conn.companyName || conn.realmId} ({conn.accountType})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={mapClientId} onValueChange={setMapClientId}>
            <SelectTrigger className="w-[220px]">
              <Building2 className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Assign to client..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No assignment</SelectItem>
              {crmClients?.map((client) => (
                <SelectItem key={client.id} value={String(client.id)}>
                  {client.companyName || client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="default"
            onClick={handleApprove}
            disabled={approveMutation.isPending || (selectedInvoices.size === 0 && selectedPayments.size === 0)}
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Post Selected
          </Button>
          <Button
            variant="outline"
            onClick={handleReject}
            disabled={rejectMutation.isPending || (selectedInvoices.size === 0 && selectedPayments.size === 0)}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Reject
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allInvoices.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allPayments.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Suggested Matches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{suggestions?.suggestions?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Suggested Matches Banner */}
      {suggestions?.suggestions && suggestions.suggestions.length > 0 && (
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-sm">Suggested Client Matches</CardTitle>
            <CardDescription>QBO customers that might match your CRM clients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {suggestions.suggestions.slice(0, 5).map((sugg) => (
                <div key={sugg.qboCustomerId} className="flex items-center gap-2 bg-background border rounded-lg px-3 py-2">
                  <span className="text-sm font-medium">{sugg.qboDisplayName}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="text-sm">{sugg.suggestedClientName}</span>
                  <Badge variant="outline" className="text-xs">
                    {Math.round(sugg.confidence * 100)}%
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2"
                    onClick={() =>
                      mapMutation.mutate({
                        qboCustomerId: sugg.qboCustomerId,
                        clientId: sugg.suggestedClientId!,
                      })
                    }
                    disabled={!sugg.suggestedClientId}
                  >
                    Map
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoices Table */}
      {allInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Invoices Awaiting Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>QBO Customer</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mapped Client</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedInvoices.has(inv.id)}
                        onCheckedChange={() => toggleInvoice(inv.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{inv.qboCustomerName}</TableCell>
                    <TableCell>{inv.invoiceNumber || inv.docNumber}</TableCell>
                    <TableCell>{inv.transactionDate ? new Date(inv.transactionDate).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>${inv.totalAmount?.toFixed(2)}</TableCell>
                    <TableCell>${inv.balance?.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "paid" ? "default" : "secondary"}>{inv.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {inv.clientId ? (
                        <Badge variant="outline" className="bg-green-50">
                          {crmClients?.find((c) => c.id === inv.clientId)?.companyName || "Mapped"}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not mapped</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Payments Table */}
      {allPayments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Payments Awaiting Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>QBO Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Mapped Client</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allPayments.map((pmt) => (
                  <TableRow key={pmt.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedPayments.has(pmt.id)}
                        onCheckedChange={() => togglePayment(pmt.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{pmt.qboCustomerName}</TableCell>
                    <TableCell>${pmt.totalAmount?.toFixed(2)}</TableCell>
                    <TableCell>{pmt.transactionDate ? new Date(pmt.transactionDate).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>{pmt.paymentMethod || "—"}</TableCell>
                    <TableCell>
                      {pmt.clientId ? (
                        <Badge variant="outline" className="bg-green-50">
                          {crmClients?.find((c) => c.id === pmt.clientId)?.companyName || "Mapped"}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not mapped</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {allInvoices.length === 0 && allPayments.length === 0 && (
        <Card className="p-12 text-center">
          <div className="text-muted-foreground">
            <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-medium">All caught up!</h3>
            <p>No items awaiting review from QuickBooks.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
