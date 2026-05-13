import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import {
  FileSignature,
  Plus,
  Send,
  CheckCircle,
  Clock,
  Eye,
  PenLine,
  Trash2,
  X,
  Save,
  FileText,
  Shield,
  Mail,
  Lock,
  Unlock,
  Copy,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DOC_TYPE_LABELS: Record<string, string> = {
  engagement_letter: "Engagement Letter",
  tax_authorization: "Tax Authorization",
  poa: "Power of Attorney",
  consent: "Consent Form",
  nda: "NDA",
  custom: "Custom Document",
};

const DOC_TYPE_ICONS: Record<string, React.ReactNode> = {
  engagement_letter: <FileText className="h-4 w-4" />,
  tax_authorization: <Shield className="h-4 w-4" />,
  poa: <Lock className="h-4 w-4" />,
  consent: <CheckCircle className="h-4 w-4" />,
  nda: <Eye className="h-4 w-4" />,
  custom: <FileText className="h-4 w-4" />,
};

export default function Signatures() {
  const { can } = useAuth();
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [activeTab, setActiveTab] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingDoc, setEditingDoc] = useState<number | null>(null);

  // Create form state
  const [form, setForm] = useState({
    title: "",
    description: "",
    content: "",
    documentType: "custom" as string,
  });

  const { data: clients } = trpc.crmClient.list.useQuery();
  const utils = trpc.useUtils();

  const { data: documents } = trpc.signature.list.useQuery(
    selectedClient ? { clientId: parseInt(selectedClient) } : undefined
  );

  const create = trpc.signature.create.useMutation({
    onSuccess: () => {
      utils.signature.list.invalidate();
      setShowCreate(false);
      setForm({ title: "", description: "", content: "", documentType: "custom" });
    },
  });

  const sendDoc = trpc.signature.send.useMutation({
    onSuccess: () => utils.signature.list.invalidate(),
  });

  const del = trpc.signature.delete.useMutation({
    onSuccess: () => utils.signature.list.invalidate(),
  });

  const cancel = trpc.signature.cancel.useMutation({
    onSuccess: () => utils.signature.list.invalidate(),
  });

  const update = trpc.signature.update.useMutation({
    onSuccess: () => {
      utils.signature.list.invalidate();
      setEditingDoc(null);
    },
  });

  const filteredDocs = documents?.filter((d) => {
    if (activeTab === "all") return true;
    return d.status === activeTab;
  });

  const handleCreate = () => {
    if (!selectedClient || !form.title || !form.content) return;
    create.mutate({
      clientId: parseInt(selectedClient),
      title: form.title,
      description: form.description || undefined,
      content: form.content,
      documentType: form.documentType as "engagement_letter" | "tax_authorization" | "poa" | "consent" | "nda" | "custom",
    });
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: "bg-slate-400",
      sent: "bg-blue-500",
      viewed: "bg-purple-500",
      signed: "bg-emerald-500",
      expired: "bg-red-500",
      cancelled: "bg-gray-500",
    };
    return <Badge className={styles[status] || "bg-slate-400"}>{status}</Badge>;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FileSignature className="h-6 w-6 text-lime-500" />
          Documents for Signature
        </h1>
        <p className="text-slate-500 mt-1">
          Create, send, and track any document that needs a client signature — engagement letters, tax authorizations, consent forms, and more.
        </p>
      </div>

      {/* Client Selector */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex-1 w-full">
              <Label className="text-sm font-medium mb-2 block">Select Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedClient && can.senior && (
              <Button className="bg-lime-500 hover:bg-lime-600" onClick={() => { setShowCreate(true); setEditingDoc(null); setForm({ title: "", description: "", content: "", documentType: "custom" }); }}>
                <Plus className="h-4 w-4 mr-2" />
                New Document
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create Document Form */}
      {showCreate && can.senior && (
        <Card className="border-lime-300">
          <CardHeader>
            <CardTitle>Create Document for Signature</CardTitle>
            <CardDescription>Write or paste the document content below. The client will see this in their portal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select value={form.documentType} onValueChange={(v) => setForm({ ...form, documentType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="engagement_letter">Engagement Letter</SelectItem>
                    <SelectItem value="tax_authorization">Tax Authorization</SelectItem>
                    <SelectItem value="poa">Power of Attorney</SelectItem>
                    <SelectItem value="consent">Consent Form</SelectItem>
                    <SelectItem value="nda">NDA</SelectItem>
                    <SelectItem value="custom">Custom Document</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g., 2025 Engagement Letter — Bookkeeping Services"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description (optional — visible to client)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description of what this document is for..."
              />
            </div>
            <div className="space-y-2">
              <Label>Document Content *</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Paste or type the full document content here. The client will read this and sign at the bottom."
                rows={12}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={create.isPending} className="bg-lime-500 hover:bg-lime-600">
                <Save className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents List */}
      {selectedClient && documents && documents.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="all">All ({documents.length})</TabsTrigger>
            <TabsTrigger value="draft">Drafts ({documents.filter(d => d.status === "draft").length})</TabsTrigger>
            <TabsTrigger value="sent">Sent ({documents.filter(d => d.status === "sent").length})</TabsTrigger>
            <TabsTrigger value="viewed">Viewed ({documents.filter(d => d.status === "viewed").length})</TabsTrigger>
            <TabsTrigger value="signed">Signed ({documents.filter(d => d.status === "signed").length})</TabsTrigger>
            <TabsTrigger value="expired">Expired ({documents.filter(d => d.status === "expired").length})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4 space-y-3">
            {filteredDocs?.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center text-slate-400">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p>No documents in this category.</p>
                </CardContent>
              </Card>
            )}

            {filteredDocs?.map((doc) => {
              const client = clients?.find((c) => c.id === doc.clientId);
              return (
                <Card key={doc.id} className={cn(doc.status === "signed" && "border-emerald-200 bg-emerald-50/30")}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-slate-500">{DOC_TYPE_ICONS[doc.documentType] || <FileText className="h-4 w-4" />}</span>
                          <p className="font-medium">{doc.title}</p>
                          {statusBadge(doc.status)}
                        </div>
                        <p className="text-xs text-slate-500 mb-2">
                          {client?.name} • {DOC_TYPE_LABELS[doc.documentType] || doc.documentType}
                          {doc.sentAt && ` • Sent ${format(new Date(doc.sentAt), "MMM d, yyyy")}`}
                          {doc.signedAt && ` • Signed by ${doc.signedBy} on ${format(new Date(doc.signedAt), "MMM d, yyyy")}`}
                          {doc.viewedAt && !doc.signedAt && ` • Viewed ${format(new Date(doc.viewedAt), "MMM d, yyyy")}`}
                        </p>
                        {doc.description && (
                          <p className="text-sm text-slate-600 mb-2">{doc.description}</p>
                        )}

                        {/* Document Preview */}
                        {editingDoc === doc.id ? (
                          <div className="space-y-3 mt-3">
                            <Textarea
                              defaultValue={doc.content}
                              rows={8}
                              id={`edit-content-${doc.id}`}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="bg-lime-500"
                                onClick={() => {
                                  const el = document.getElementById(`edit-content-${doc.id}`) as HTMLTextAreaElement;
                                  if (el) update.mutate({ id: doc.id, content: el.value });
                                }}
                              >
                                <Save className="h-3 w-3 mr-1" /> Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingDoc(null)}>
                                <X className="h-3 w-3 mr-1" /> Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-slate-50 rounded-lg p-3 mt-2 max-h-32 overflow-auto">
                            <pre className="text-xs text-slate-600 whitespace-pre-wrap">{doc.content}</pre>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-1 ml-4">
                        {doc.status === "draft" && can.senior && (
                          <Button
                            size="sm"
                            className="bg-lime-500"
                            onClick={() => {
                              if (confirm("Send this document to the client for signature?")) {
                                sendDoc.mutate({ id: doc.id });
                              }
                            }}
                            disabled={sendDoc.isPending}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            Send
                          </Button>
                        )}
                        {doc.status === "draft" && can.senior && (
                          <Button size="sm" variant="outline" onClick={() => { setEditingDoc(doc.id); setShowCreate(false); }}>
                            <PenLine className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                        )}
                        {(doc.status === "sent" || doc.status === "viewed") && doc.portalToken && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const url = `${window.location.origin}/portal/${doc.portalToken}?tab=documents`;
                              navigator.clipboard.writeText(url);
                              alert("Portal link copied to clipboard!");
                            }}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy Link
                          </Button>
                        )}
                        {doc.status !== "draft" && doc.status !== "cancelled" && can.senior && (
                          <Button size="sm" variant="ghost" className="text-amber-600" onClick={() => cancel.mutate({ id: doc.id })}>
                            <X className="h-3 w-3 mr-1" />
                            Cancel
                          </Button>
                        )}
                        {doc.status === "draft" && can.senior && (
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => { if (confirm("Delete this document?")) del.mutate({ id: doc.id }); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Signature Info */}
                    {doc.status === "signed" && doc.signatureData && (
                      <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <div className="flex items-center gap-2 text-emerald-700">
                          <CheckCircle className="h-4 w-4" />
                          <span className="text-sm font-medium">
                            Signed by {doc.signedBy} on {doc.signedAt ? format(new Date(doc.signedAt), "MMM d, yyyy 'at' h:mm a") : ""}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      )}

      {selectedClient && documents?.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center text-slate-400">
            <FileSignature className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-lg">No signature documents yet</p>
            <p className="text-sm mt-1">Click "New Document" to create an engagement letter, tax authorization, or any document needing a client signature.</p>
          </CardContent>
        </Card>
      )}

      {!selectedClient && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center text-slate-400">
            <FileSignature className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-lg">Select a client to manage signature documents</p>
            <p className="text-sm mt-1">Choose a client from the dropdown above to view or create documents for signature.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
