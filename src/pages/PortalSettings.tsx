import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  Copy,
  CheckCircle,
  AlertTriangle,
  Clock,
  Globe,
  Eye,
  EyeOff,
  Mail,
  Link2,
  Plus,
  Send,
  CheckSquare,
  XCircle,
  UserCircle,
  ExternalLink,
  FileText,
  Trash2,
  FolderOpen,
  FileUp,
} from "lucide-react";
import { format, isPast } from "date-fns";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  financial_statement: "Financial Statement",
  report: "Report",
  tax_document: "Tax Document",
  receipt: "Receipt",
  general: "General",
  engagement_letter: "Engagement Letter",
};

export default function PortalSettings() {
  const { can } = useAuth();
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("setup");

  // Missing item form state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [itemTitle, setItemTitle] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemCategory, setItemCategory] = useState<string>("other");
  const [itemDueDate, setItemDueDate] = useState("");
  const [sendEmailOnCreate, setSendEmailOnCreate] = useState(true); // NEW: default checked

  // File sharing form state
  const [showAddFileDialog, setShowAddFileDialog] = useState(false);
  const [fileForm, setFileForm] = useState({
    name: "",
    description: "",
    category: "general" as string,
    webViewLink: "",
    provider: "link" as string,
  });

  // Email notification state
  const [selectedItemId, setSelectedItemId] = useState<number | undefined>();
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const { data: clients } = trpc.crmClient.list.useQuery();
  const clientId = selectedClientId ? parseInt(selectedClientId) : 0;

  const { data: settings, refetch: refetchSettings } = trpc.portal.getSettings.useQuery(
    { clientId },
    { enabled: clientId > 0 }
  );

  const { data: missingItems, refetch: refetchItems } = trpc.portal.listMissingItems.useQuery(
    { clientId },
    { enabled: clientId > 0 }
  );

  const { data: portalFilesList, refetch: refetchFiles } = trpc.portal.listPortalFiles.useQuery(
    { clientId },
    { enabled: clientId > 0 }
  );

  const { data: emailTemplate } = trpc.portal.getMissingItemEmailTemplate.useQuery(
    { clientId, itemId: selectedItemId },
    { enabled: clientId > 0 && showEmailDialog }
  );

  const createToken = trpc.portal.createToken.useMutation({ onSuccess: () => refetchSettings() });
  const updateSettings = trpc.portal.updateSettings.useMutation({ onSuccess: () => refetchSettings() });
  const createMissingItem = trpc.portal.createMissingItem.useMutation({
    onSuccess: () => {
      setShowCreateDialog(false);
      setItemTitle(""); setItemDescription(""); setItemCategory("other"); setItemDueDate("");
      refetchItems();
    },
  });
  const reviewItem = trpc.portal.reviewMissingItem.useMutation({ onSuccess: () => refetchItems() });
  const addPortalFile = trpc.portal.addPortalFile.useMutation({
    onSuccess: () => { setShowAddFileDialog(false); setFileForm({ name: "", description: "", category: "general", webViewLink: "", provider: "link" }); refetchFiles(); },
  });
  const deletePortalFile = trpc.portal.deletePortalFile.useMutation({ onSuccess: () => refetchFiles() });
  const toggleFileVisibility = trpc.portal.togglePortalFileVisibility.useMutation({ onSuccess: () => refetchFiles() });

  // Email sending (via existing email router - composing manually)
  const sendEmail = trpc.email.send.useMutation({
    onSuccess: () => { setShowEmailDialog(false); setEmailSubject(""); setEmailBody(""); },
  });

  // Get connected accounts for sending email
  const { data: connectedAccounts } = trpc.integration.listAccounts.useQuery();
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>();

  const selectedClient = clients?.find((c) => c.id === clientId);

  const handleGenerateLink = () => { if (clientId && email) createToken.mutate({ clientId, email }); };
  const handleCopyLink = () => {
    if (createToken.data?.url) {
      navigator.clipboard.writeText(`${window.location.origin}${createToken.data.url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  const handleToggle = (field: string, value: boolean) => {
    if (!clientId) return;
    updateSettings.mutate({ clientId, [field]: value });
  };
  const handleCreateMissingItem = () => {
    if (!clientId || !itemTitle) return;
    createMissingItem.mutate(
      {
        clientId,
        title: itemTitle,
        description: itemDescription || undefined,
        category: itemCategory as any,
        dueDate: itemDueDate ? new Date(itemDueDate) : undefined,
        sendEmail: sendEmailOnCreate,
      },
      {
        onSuccess: (item) => {
          setShowCreateDialog(false);
          setItemTitle(""); setItemDescription(""); setItemCategory("other"); setItemDueDate("");
          setSendEmailOnCreate(true);
          refetchItems();

          // If email was requested and we have a connected account, auto-send
          if (sendEmailOnCreate && selectedAccountId && selectedClient) {
            const subject = `Action needed: ${item.title} — Go Fig Bookz`;
            const body = `Hi ${selectedClient.name},

I hope you're doing well! I wanted to reach out because I haven't received ${item.title} yet, and I need these to close your books for the period.

To make it easy, you can upload everything directly through your secure client portal — just click the link below and drag and drop your files:

${window.location.origin}/portal/

If you have any questions or need help, just reply to this email.

Thanks so much!

— Go Fig Bookz`;

            sendEmail.mutate({
              connectedAccountId: selectedAccountId,
              clientId,
              to: selectedClient.email || "",
              subject,
              body,
            });
          }
        },
      }
    );
  };
  const handleAddFile = () => {
    if (!clientId || !fileForm.name) return;
    addPortalFile.mutate({ clientId, name: fileForm.name, description: fileForm.description || undefined, category: fileForm.category as any, provider: fileForm.provider as any, webViewLink: fileForm.webViewLink || undefined });
  };

  // Open email dialog with template
  const openEmailDialog = (itemId?: number) => {
    setSelectedItemId(itemId);
    setShowEmailDialog(true);
  };

  // Pre-fill email when template loads
  useState(() => {
    if (emailTemplate) {
      setEmailSubject(emailTemplate.subject);
      setEmailBody(emailTemplate.body);
    }
  });

  const handleSendEmail = () => {
    if (!clientId || !selectedClient || !selectedAccountId) return;
    sendEmail.mutate({
      connectedAccountId: selectedAccountId,
      clientId,
      to: selectedClient.email,
      subject: emailSubject,
      body: emailBody,
    });
  };

  const pendingItems = missingItems?.filter((i) => i.status === "pending") || [];
  const submittedItems = missingItems?.filter((i) => i.status === "submitted") || [];
  const resolvedItems = missingItems?.filter((i) => i.status === "approved" || i.status === "overdue") || [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Client Portal Settings</h1>
        <p className="text-slate-500 mt-1">
          Manage what each client can see in their portal, share files, and send email reminders.
        </p>
      </div>

      {/* Client Selector */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex-1 w-full">
              <Label className="text-sm font-medium mb-2 block">Select Client</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a client to manage their portal..." />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id.toString()}>{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedClient && (
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-lg">
                <UserCircle className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm font-medium">{selectedClient.name}</p>
                  <p className="text-xs text-slate-500">{selectedClient.email}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedClientId ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="setup"><Globe className="h-4 w-4 mr-2" />Portal Setup</TabsTrigger>
            <TabsTrigger value="visibility"><Eye className="h-4 w-4 mr-2" />Visibility</TabsTrigger>
            <TabsTrigger value="files"><FolderOpen className="h-4 w-4 mr-2" />Files {portalFilesList && portalFilesList.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{portalFilesList.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="requests"><CheckSquare className="h-4 w-4 mr-2" />Missing Items {pendingItems.length > 0 && <Badge variant="destructive" className="ml-1 text-xs">{pendingItems.length}</Badge>}</TabsTrigger>
          </TabsList>

          {/* SETUP TAB */}
          <TabsContent value="setup" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-5 w-5 text-lime-500" />
                  Generate Access Link
                </CardTitle>
                <CardDescription>Create a secure, passwordless link for your client. Links expire after 90 days.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <Label className="text-sm mb-2 block">Client Email</Label>
                    <div className="flex gap-2">
                      <Mail className="h-4 w-4 text-slate-400 mt-3" />
                      <Input type="email" placeholder="client@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" />
                    </div>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleGenerateLink} disabled={!email || createToken.isPending} className="bg-lime-500 hover:bg-lime-600">
                      {createToken.isPending ? "Generating..." : <><Send className="h-4 w-4 mr-2" />Generate Link</>}
                    </Button>
                  </div>
                </div>
                {createToken.data && (
                  <div className="p-4 bg-lime-50 border border-lime-200 rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-lime-600" />
                      <p className="font-medium text-lime-800">Portal link generated!</p>
                    </div>
                    <div className="flex gap-2">
                      <Input value={`${window.location.origin}${createToken.data.url}`} readOnly className="flex-1 bg-white" />
                      <Button variant="outline" onClick={handleCopyLink} className={cn(copied && "bg-lime-100 border-lime-300")}>
                        {copied ? <><CheckCircle className="h-4 w-4 mr-2 text-lime-600" />Copied</> : <><Copy className="h-4 w-4 mr-2" />Copy</>}
                      </Button>
                    </div>
                    <Button variant="link" className="p-0 h-auto text-sm" onClick={() => window.open(`${window.location.origin}${createToken.data.url}`, '_blank')}>
                      <ExternalLink className="h-3 w-3 mr-1" />Preview Portal
                    </Button>
                  </div>
                )}
                {settings?.isEnabled && (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-medium text-blue-800">Portal is active</p>
                      <p className="text-xs text-blue-600">This client has portal access.</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Welcome Message</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  defaultValue={settings?.welcomeMessage || ""}
                  placeholder="Welcome to your Go Fig Bookz client portal..."
                  className="min-h-[80px]"
                  onBlur={(e) => { if (e.target.value !== settings?.welcomeMessage) handleToggle("welcomeMessage", e.target.value as any); }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* VISIBILITY TAB */}
          <TabsContent value="visibility" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-lime-500" />Portal Visibility</CardTitle>
                <CardDescription>Choose what this client can see and do in their portal.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: "showFinancialOverview", label: "Financial Overview", description: "Show revenue, expenses, net income, and equity", icon: <Eye className="h-4 w-4" /> },
                  { key: "showTasks", label: "Tasks", description: "Show assigned tasks and their status", icon: <CheckSquare className="h-4 w-4" /> },
                  { key: "showDocuments", label: "Document Upload & Shared Files", description: "Allow client to upload files and view shared documents", icon: <FolderOpen className="h-4 w-4" /> },
                  { key: "showInvoices", label: "Billing / Invoices", description: "Show invoice and billing information", icon: <Mail className="h-4 w-4" /> },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg text-slate-500">{item.icon}</div>
                      <div>
                        <p className="font-medium text-sm">{item.label}</p>
                        <p className="text-xs text-slate-500">{item.description}</p>
                      </div>
                    </div>
                    <Switch checked={settings?.[item.key as keyof typeof settings] as boolean || false} onCheckedChange={(checked) => handleToggle(item.key, checked)} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* FILES TAB */}
          <TabsContent value="files" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FolderOpen className="h-5 w-5 text-lime-500" />
                    Shared Files
                  </CardTitle>
                  <CardDescription>Files visible to this client in their portal.</CardDescription>
                </div>
                <Dialog open={showAddFileDialog} onOpenChange={setShowAddFileDialog}>
                  <DialogTrigger asChild>
                    <Button className="bg-lime-500 hover:bg-lime-600"><Plus className="h-4 w-4 mr-2" />Add File</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Add File to Portal</DialogTitle></DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div>
                        <Label className="text-sm mb-2 block">File Name *</Label>
                        <Input placeholder="e.g., March 2025 Financial Statements" value={fileForm.name} onChange={(e) => setFileForm({ ...fileForm, name: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-sm mb-2 block">Description</Label>
                        <Input placeholder="Optional description..." value={fileForm.description} onChange={(e) => setFileForm({ ...fileForm, description: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-sm mb-2 block">Category</Label>
                        <Select value={fileForm.category} onValueChange={(v) => setFileForm({ ...fileForm, category: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="financial_statement">Financial Statement</SelectItem>
                            <SelectItem value="report">Report</SelectItem>
                            <SelectItem value="tax_document">Tax Document</SelectItem>
                            <SelectItem value="receipt">Receipt</SelectItem>
                            <SelectItem value="general">General</SelectItem>
                            <SelectItem value="engagement_letter">Engagement Letter</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-sm mb-2 block">Link / URL *</Label>
                        <Input placeholder="https://drive.google.com/... or any file link" value={fileForm.webViewLink} onChange={(e) => setFileForm({ ...fileForm, webViewLink: e.target.value })} />
                        <p className="text-xs text-slate-400 mt-1">Paste a Google Drive link, OneDrive link, or any URL.</p>
                      </div>
                      <Button onClick={handleAddFile} disabled={!fileForm.name || addPortalFile.isPending} className="w-full bg-lime-500 hover:bg-lime-600">
                        {addPortalFile.isPending ? "Adding..." : "Add to Portal"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-3">
                {portalFilesList && portalFilesList.length > 0 ? (
                  portalFilesList.map((file) => (
                    <div key={file.id} className={cn("flex items-center justify-between p-4 rounded-lg border", file.isVisible ? "bg-white" : "bg-slate-50 opacity-60")}>
                      <div className="flex items-center gap-3 flex-1">
                        <FileText className="h-5 w-5 text-slate-400" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{file.name}</p>
                            <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[file.category] || file.category}</Badge>
                            {!file.isVisible && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                          </div>
                          {file.description && <p className="text-xs text-slate-500">{file.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {file.webViewLink && (
                          <Button size="sm" variant="outline" onClick={() => window.open(file.webViewLink!, '_blank')}>
                            <ExternalLink className="h-3 w-3 mr-1" />Open
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => toggleFileVisibility.mutate({ id: file.id, isVisible: !file.isVisible })}>
                          {file.isVisible ? <EyeOff className="h-4 w-4 text-slate-400" /> : <Eye className="h-4 w-4 text-lime-500" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-400" onClick={() => { if (confirm("Remove this file from the portal?")) deletePortalFile.mutate({ id: file.id }); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    <FolderOpen className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                    <p>No files shared yet.</p>
                    <p className="text-sm">Add financial statements, reports, or any file your client should see.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* MISSING ITEMS TAB */}
          <TabsContent value="requests" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Missing Items
                  </CardTitle>
                  <CardDescription>Request documents and track submissions.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => openEmailDialog()}>
                    <Mail className="h-4 w-4 mr-2" />Send Reminder Email
                  </Button>
                  <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                    <DialogTrigger asChild>
                      <Button className="bg-lime-500 hover:bg-lime-600"><Plus className="h-4 w-4 mr-2" />Request Item</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader><DialogTitle>Request Missing Item</DialogTitle></DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div><Label className="text-sm mb-2 block">Title *</Label><Input placeholder="e.g., March 2025 Bank Statement" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} /></div>
                        <div><Label className="text-sm mb-2 block">Description</Label><Textarea placeholder="Optional details..." value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} /></div>
                        <div>
                          <Label className="text-sm mb-2 block">Category</Label>
                          <Select value={itemCategory} onValueChange={setItemCategory}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bank_statement">Bank Statement</SelectItem>
                              <SelectItem value="receipt">Receipt</SelectItem>
                              <SelectItem value="invoice">Invoice</SelectItem>
                              <SelectItem value="tax_form">Tax Form</SelectItem>
                              <SelectItem value="payroll_doc">Payroll Document</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label className="text-sm mb-2 block">Due Date</Label><Input type="date" value={itemDueDate} onChange={(e) => setItemDueDate(e.target.value)} /></div>
                        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <input type="checkbox" id="sendEmailOnCreate" checked={sendEmailOnCreate} onChange={(e) => setSendEmailOnCreate(e.target.checked)} className="rounded border-gray-300 h-4 w-4" />
                          <div>
                            <Label htmlFor="sendEmailOnCreate" className="text-sm font-medium text-blue-800 cursor-pointer">Also send email to client</Label>
                            <p className="text-xs text-blue-600">Auto-send a reminder with portal link</p>
                          </div>
                        </div>
                        <Button onClick={handleCreateMissingItem} disabled={!itemTitle || createMissingItem.isPending} className="w-full bg-lime-500 hover:bg-lime-600">
                          {createMissingItem.isPending ? "Creating..." : "Send Request"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Pending Items */}
                {pendingItems.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Pending ({pendingItems.length})</h3>
                    <div className="space-y-2">
                      {pendingItems.map((item) => (
                        <div key={item.id} className="p-4 border-amber-200 bg-amber-50 rounded-lg border">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs capitalize">{item.category.replace("_", " ")}</Badge>
                                {item.dueDate && <Badge variant={isPast(new Date(item.dueDate)) ? "destructive" : "outline"} className="text-xs">Due {format(new Date(item.dueDate), "MMM d")}</Badge>}
                                {item.emailSentAt && (
                                  <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                    <Mail className="h-3 w-3 mr-1" />Emailed {format(new Date(item.emailSentAt), "MMM d")}
                                  </Badge>
                                )}
                              </div>
                              <p className="font-medium text-sm">{item.title}</p>
                              {item.description && <p className="text-xs text-slate-500 mt-1">{item.description}</p>}
                            </div>
                            <div className="flex gap-1 ml-2">
                              <Button size="sm" variant="outline" onClick={() => openEmailDialog(item.id)}><Mail className="h-3 w-3 mr-1" />Email</Button>
                              <Button variant="ghost" size="sm" onClick={() => reviewItem.mutate({ id: item.id, status: "overdue" })}><XCircle className="h-4 w-4 text-slate-400" /></Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Submitted Items */}
                {submittedItems.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2"><Clock className="h-4 w-4" />Submitted — Awaiting Review ({submittedItems.length})</h3>
                    <div className="space-y-2">
                      {submittedItems.map((item) => (
                        <div key={item.id} className="p-4 border-blue-200 bg-blue-50 rounded-lg border">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs capitalize">{item.category.replace("_", " ")}</Badge>
                                <Badge variant="secondary" className="text-xs">Submitted {item.submittedAt ? format(new Date(item.submittedAt), "MMM d") : ""}</Badge>
                              </div>
                              <p className="font-medium text-sm">{item.title}</p>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="text-xs border-lime-300 text-lime-700 hover:bg-lime-50" onClick={() => reviewItem.mutate({ id: item.id, status: "approved" })}><CheckCircle className="h-3 w-3 mr-1" />Approve</Button>
                              <Button size="sm" variant="outline" className="text-xs border-red-300 text-red-700 hover:bg-red-50" onClick={() => reviewItem.mutate({ id: item.id, status: "overdue" })}><XCircle className="h-3 w-3 mr-1" />Reject</Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Resolved Items */}
                {resolvedItems.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-500 mb-3 flex items-center gap-2"><CheckCircle className="h-4 w-4" />Resolved ({resolvedItems.length})</h3>
                    <div className="space-y-2">
                      {resolvedItems.map((item) => (
                        <div key={item.id} className="p-3 border-slate-200 bg-slate-50 rounded-lg border opacity-60">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs capitalize">{item.category.replace("_", " ")}</Badge>
                            <p className="text-sm">{item.title}</p>
                            <Badge variant={item.status === "approved" ? "default" : "destructive"} className="text-xs ml-auto">{item.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {missingItems?.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <CheckSquare className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                    <p>No missing item requests yet.</p>
                    <p className="text-sm">Click "Request Item" to ask your client for documents.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center text-slate-400">
            <Globe className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p className="font-medium text-lg">Select a client to manage their portal</p>
            <p className="text-sm mt-1">Choose a client from the dropdown above.</p>
          </CardContent>
        </Card>
      )}

      {/* Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Send Email Reminder</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-4">
            {emailTemplate && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                <p className="font-medium">Pre-filled from template</p>
                <p className="text-xs">Edit the subject and message below before sending.</p>
              </div>
            )}
            <div>
              <Label className="text-sm mb-2 block">From Account</Label>
              <Select value={selectedAccountId?.toString() || ""} onValueChange={(v) => setSelectedAccountId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Select connected email account..." /></SelectTrigger>
                <SelectContent>
                  {connectedAccounts?.map((acct) => (
                    <SelectItem key={acct.id} value={acct.id.toString()}>{acct.accountLabel} ({acct.accountEmail})</SelectItem>
                  )) || <SelectItem value="" disabled>No accounts connected</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm mb-2 block">Subject</Label>
              <Input value={emailSubject || emailTemplate?.subject || ""} onChange={(e) => setEmailSubject(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm mb-2 block">Message</Label>
              <Textarea value={emailBody || emailTemplate?.body || ""} onChange={(e) => setEmailBody(e.target.value)} rows={10} />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSendEmail} disabled={!selectedAccountId || sendEmail.isPending} className="bg-lime-500 hover:bg-lime-600">
                <Send className="h-4 w-4 mr-2" />{sendEmail.isPending ? "Sending..." : "Send Email"}
              </Button>
              <Button variant="outline" onClick={() => setShowEmailDialog(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
