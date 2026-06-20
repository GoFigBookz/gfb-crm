import { useState } from "react";
import { useParams, Link, useSearchParams } from "react-router";
import { Upload, CheckCircle, Clock, AlertTriangle, FileText, DollarSign, Calendar, ChevronRight, CheckSquare, Send, ArrowLeft, LogOut, FolderOpen, ExternalLink, FileSignature, PenLine, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/providers/trpc";
import { format, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  financial_statement: "Financial Statement",
  report: "Report",
  tax_document: "Tax Document",
  receipt: "Receipt",
  general: "General",
  engagement_letter: "Engagement Letter",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  engagement_letter: "Engagement Letter",
  tax_authorization: "Tax Authorization",
  poa: "Power of Attorney",
  consent: "Consent Form",
  nda: "NDA",
  custom: "Custom Document",
};

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "overview");
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [signingDoc, setSigningDoc] = useState<number | null>(null);
  const [signatureName, setSignatureName] = useState("");

  const { data: portalData, isLoading } = trpc.portal.validateToken.useQuery(
    { token: token! },
    { enabled: !!token, retry: false }
  );

  const { data: clientData } = trpc.portal.getClientData.useQuery(
    { token: token! },
    { enabled: !!portalData?.client }
  );

  const submitItem = trpc.portal.submitMissingItem.useMutation({
    onSuccess: () => { setSubmittingId(null); window.location.reload(); },
  });

  const signDocument = trpc.signature.sign.useMutation({
    onSuccess: () => { setSigningDoc(null); setSignatureName(""); window.location.reload(); },
    onError: (e) => alert(`Could not sign: ${e.message}`),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400">Loading your portal...</p>
      </div>
    );
  }

  if (!portalData || !portalData.client) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-8">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Link Expired or Invalid</h2>
          <p className="text-slate-500 mb-4">This portal link has expired or is no longer valid. Please contact your bookkeeper for a new link.</p>
        </Card>
      </div>
    );
  }

  const { client, settings } = portalData;
  const { tasks, snapshot, missingItems, taskRules, sharedFiles, signatureDocuments } = clientData || {};

  const openTasks = (tasks || []).filter((t) => !t.completed);
  const completedTasks = (tasks || []).filter((t) => t.completed);
  const pendingItems = (missingItems || []).filter((i) => i.status === "pending");
  const submittedItems = (missingItems || []).filter((i) => i.status === "submitted");
  const taskProgress = tasks?.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

  // Filter visible files and pending signature docs
  const visibleFiles = (sharedFiles || []).filter((f) => f.isVisible);
  const pendingSigs = (signatureDocuments || []).filter((d) => d.status === "sent" || d.status === "viewed");
  const signedSigs = (signatureDocuments || []).filter((d) => d.status === "signed");

  const tabCount = 3 + (settings?.showTasks ? 1 : 0) + (settings?.showDocuments ? 1 : 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/assets/logo.jpg" alt="Go Fig Bookz" className="h-8 w-auto object-contain" />
            <span className="font-semibold text-slate-700 hidden sm:inline">Client Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{client.name}</span>
            <Badge variant="outline" className="bg-lime-50 text-lime-700 border-lime-200">
              <CheckCircle className="h-3 w-3 mr-1" /> Active
            </Badge>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome */}
        {settings?.welcomeMessage && (
          <Card className="bg-gradient-to-r from-lime-50 to-emerald-50 border-lime-200">
            <CardContent className="p-5">
              <h2 className="font-semibold text-slate-800 mb-1">Welcome, {client.name}</h2>
              <p className="text-sm text-slate-600">{settings.welcomeMessage}</p>
            </CardContent>
          </Card>
        )}

        {/* Missing Items Alert */}
        {pendingItems.length > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-amber-800">
                    {pendingItems.length} item{pendingItems.length > 1 ? "s" : ""} need{pendingItems.length === 1 ? "s" : ""} your attention
                  </p>
                  <p className="text-sm text-amber-700">
                    Please upload the requested documents below. Your bookkeeper is waiting for these to complete your books.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Documents for Signature Alert */}
        {pendingSigs.length > 0 && (
          <Card className="border-blue-300 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <FileSignature className="h-6 w-6 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-blue-800">
                    {pendingSigs.length} document{pendingSigs.length > 1 ? "s" : ""} awaiting your signature
                  </p>
                  <p className="text-sm text-blue-700">
                    Please review and sign in the Signatures tab.
                  </p>
                  <Button size="sm" className="mt-2 bg-blue-600 hover:bg-blue-700" onClick={() => setActiveTab("signatures")}>
                    Review &amp; sign now
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${tabCount}, 1fr)` }}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {settings?.showTasks && <TabsTrigger value="tasks">Tasks</TabsTrigger>}
            {settings?.showDocuments && <TabsTrigger value="documents"><FolderOpen className="h-3.5 w-3.5 mr-1" />Documents</TabsTrigger>}
            <TabsTrigger value="requests">
              <CheckSquare className="h-3.5 w-3.5 mr-1" />
              Requests {pendingItems.length > 0 && <Badge variant="destructive" className="ml-1 text-xs">{pendingItems.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="signatures">
              <FileSignature className="h-3.5 w-3.5 mr-1" />
              Sign {pendingSigs.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{pendingSigs.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            {settings?.showFinancialOverview && snapshot && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-lime-500" />
                    Financial Overview
                  </CardTitle>
                  <CardDescription>Your latest financial snapshot</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-emerald-50 rounded-lg">
                      <p className="text-xs text-emerald-600 uppercase font-semibold">Revenue</p>
                      <p className="text-xl font-bold text-emerald-700">${(snapshot.revenue || 0).toLocaleString()}</p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <p className="text-xs text-red-600 uppercase font-semibold">Expenses</p>
                      <p className="text-xl font-bold text-red-700">${(snapshot.expenses || 0).toLocaleString()}</p>
                    </div>
                    <div className={cn("p-4 rounded-lg", (snapshot.netIncome || 0) >= 0 ? "bg-lime-50" : "bg-amber-50")}>
                      <p className={cn("text-xs uppercase font-semibold", (snapshot.netIncome || 0) >= 0 ? "text-lime-600" : "text-amber-600")}>Net Income</p>
                      <p className={cn("text-xl font-bold", (snapshot.netIncome || 0) >= 0 ? "text-lime-700" : "text-amber-700")}>${(snapshot.netIncome || 0).toLocaleString()}</p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-600 uppercase font-semibold">Equity</p>
                      <p className="text-xl font-bold text-blue-700">${(snapshot.equity || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-lime-100 rounded-lg"><CheckCircle className="h-5 w-5 text-lime-600" /></div>
                    <div>
                      <p className="text-sm text-slate-500">Tasks Completed</p>
                      <p className="text-2xl font-bold">{completedTasks.length}</p>
                    </div>
                  </div>
                  <div className="mt-3"><Progress value={taskProgress} className="h-2" /><p className="text-xs text-slate-400 mt-1">{taskProgress}% complete</p></div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg"><Upload className="h-5 w-5 text-amber-600" /></div>
                    <div>
                      <p className="text-sm text-slate-500">Items Needed</p>
                      <p className="text-2xl font-bold text-amber-600">{pendingItems.length}</p>
                    </div>
                  </div>
                  {pendingItems.length > 0 && (
                    <Button variant="link" className="p-0 h-auto text-sm mt-2" onClick={() => setActiveTab("requests")}>
                      See what is needed <ChevronRight className="h-3 w-3" />
                    </Button>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg"><Calendar className="h-5 w-5 text-blue-600" /></div>
                    <div>
                      <p className="text-sm text-slate-500">Upcoming Deadlines</p>
                      <p className="text-2xl font-bold">{openTasks.filter((t) => t.dueDate && new Date(t.dueDate) > new Date()).length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Links */}
            {visibleFiles.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-lime-500" />
                    Recent Files
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {visibleFiles.slice(0, 3).map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium">{file.name}</p>
                          <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[file.category] || file.category}</Badge>
                        </div>
                      </div>
                      {file.webViewLink && (
                        <Button size="sm" variant="outline" onClick={() => window.open(file.webViewLink!, '_blank')}>
                          <ExternalLink className="h-3 w-3 mr-1" />Open
                        </Button>
                      )}
                    </div>
                  ))}
                  {visibleFiles.length > 3 && (
                    <Button variant="link" className="p-0 h-auto text-sm" onClick={() => setActiveTab("documents")}>
                      View all {visibleFiles.length} files <ChevronRight className="h-3 w-3" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* TASKS TAB */}
          {settings?.showTasks && (
            <TabsContent value="tasks" className="space-y-3 mt-4">
              {tasks && tasks.length > 0 ? (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <Card key={task.id} className={cn(task.completed && "opacity-60")}>
                      <CardContent className="p-4 flex items-start gap-3">
                        {task.completed ? <CheckCircle className="h-5 w-5 text-lime-500 mt-0.5" /> : <Clock className="h-5 w-5 text-amber-500 mt-0.5" />}
                        <div className="flex-1">
                          <p className={cn("font-medium", task.completed && "line-through text-slate-400")}>{task.title}</p>
                          {task.description && <p className="text-sm text-slate-500">{task.description}</p>}
                          <div className="flex items-center gap-2 mt-1">
                            {task.category && <Badge variant="secondary" className="text-xs">{task.category}</Badge>}
                            {task.dueDate && <span className="text-xs text-slate-400">Due {format(new Date(task.dueDate), "MMM d, yyyy")}</span>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-lime-500" />
                  <p>No tasks to show.</p>
                </div>
              )}
            </TabsContent>
          )}

          {/* DOCUMENTS TAB */}
          {settings?.showDocuments && (
            <TabsContent value="documents" className="space-y-4 mt-4">
              {/* Shared Files */}
              {visibleFiles.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2">
                      <FolderOpen className="h-5 w-5 text-lime-500" />
                      Your Files
                    </CardTitle>
                    <CardDescription>Documents shared by your bookkeeper</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {visibleFiles.map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-slate-400" />
                          <div>
                            <p className="font-medium text-sm">{file.name}</p>
                            {file.description && <p className="text-xs text-slate-500">{file.description}</p>}
                            <Badge variant="outline" className="text-xs mt-1">{CATEGORY_LABELS[file.category] || file.category}</Badge>
                          </div>
                        </div>
                        {file.webViewLink && (
                          <Button size="sm" variant="outline" onClick={() => window.open(file.webViewLink!, '_blank')}>
                            <ExternalLink className="h-3 w-3 mr-1" />Open
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Upload Zone */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-lime-500" />
                    Upload Documents
                  </CardTitle>
                  <CardDescription>Drag and drop files here or click to browse. Your bookkeeper will be notified.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center hover:bg-slate-50 hover:border-lime-400 transition-colors cursor-pointer"
                    onClick={() => alert("File upload would connect to your bookkeeper's file system. This is a demo.")}
                  >
                    <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                    <p className="font-medium text-slate-600">Drop files here or click to browse</p>
                    <p className="text-sm text-slate-400 mt-1">PDF, images, Excel files accepted</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* REQUESTS / MISSING ITEMS TAB */}
          <TabsContent value="requests" className="space-y-4 mt-4">
            {pendingItems.length > 0 && (
              <Card className="border-amber-300">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-amber-700">
                    <AlertTriangle className="h-5 w-5" />
                    Action Needed — {pendingItems.length} item{pendingItems.length > 1 ? "s" : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pendingItems.map((item) => (
                    <div key={item.id} className="p-4 bg-white rounded-lg border">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs capitalize">{item.category.replace("_", " ")}</Badge>
                            {item.dueDate && (
                              <Badge variant={isPast(new Date(item.dueDate)) && !isToday(new Date(item.dueDate)) ? "destructive" : "outline"} className="text-xs">
                                Due {format(new Date(item.dueDate), "MMM d")}
                              </Badge>
                            )}
                          </div>
                          <p className="font-medium">{item.title}</p>
                          {item.description && <p className="text-sm text-slate-500 mt-1">{item.description}</p>}
                        </div>
                        <Button
                          size="sm"
                          className="bg-lime-500 ml-3"
                          disabled={submittingId === item.id}
                          onClick={() => { setSubmittingId(item.id); submitItem.mutate({ itemId: item.id }); }}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          {submittingId === item.id ? "Marking..." : "I have submitted this"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {submittedItems.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    Submitted — Awaiting Review
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {submittedItems.map((item) => (
                    <div key={item.id} className="p-3 bg-blue-50 rounded-lg flex items-center gap-3">
                      <Clock className="h-4 w-4 text-blue-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-slate-500">Submitted on {item.submittedAt ? format(new Date(item.submittedAt), "MMM d") : "—"}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs">Under Review</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {pendingItems.length === 0 && submittedItems.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <CheckCircle className="h-12 w-12 mx-auto mb-3 text-lime-500" />
                <p className="font-medium">All caught up!</p>
                <p className="text-sm">Your bookkeeper has not requested anything from you right now.</p>
              </div>
            )}
          </TabsContent>

          {/* SIGNATURES TAB */}
          <TabsContent value="signatures" className="space-y-4 mt-4">
            {pendingSigs.length > 0 && (
              <Card className="border-blue-300">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-blue-700">
                    <FileSignature className="h-5 w-5" />
                    Documents Requiring Your Signature
                  </CardTitle>
                  <CardDescription>Please review each document carefully before signing.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pendingSigs.map((doc) => (
                    <div key={doc.id} className="p-4 bg-white rounded-lg border">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-medium">{doc.title}</p>
                          <p className="text-xs text-slate-500">{DOC_TYPE_LABELS[doc.documentType] || doc.documentType}</p>
                          {doc.description && <p className="text-sm text-slate-600 mt-1">{doc.description}</p>}
                        </div>
                        <Badge variant="secondary" className="text-xs">{doc.status === "viewed" ? "Viewed" : "Awaiting Signature"}</Badge>
                      </div>

                      {/* Document Content — render branded HTML docs, fall back
                          to plain text for legacy/markdown docs. */}
                      <div className="bg-white border rounded-lg p-4 mb-4 max-h-[28rem] overflow-auto">
                        {/^\s*</.test(doc.content || "") ? (
                          <div className="text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: doc.content }} />
                        ) : (
                          <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">{doc.content}</pre>
                        )}
                      </div>

                      {/* Signature Area */}
                      {signingDoc === doc.id ? (
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                          <p className="text-sm font-medium text-blue-800">Sign by typing your full name:</p>
                          <Input
                            placeholder="Type your full legal name"
                            value={signatureName}
                            onChange={(e) => setSignatureName(e.target.value)}
                          />
                          <p className="text-xs text-slate-500">
                            By typing your name above, you agree this constitutes your electronic signature and you have read and agree to the terms of this document.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-lime-500"
                              disabled={!signatureName || signDocument.isPending}
                              onClick={() => signDocument.mutate({
                                id: doc.id,
                                signedBy: signatureName,
                                signedByEmail: portalData?.email || undefined,
                                signatureType: "type_name",
                                signatureData: JSON.stringify({ name: signatureName, date: new Date().toISOString(), method: "type_name" }),
                              })}
                            >
                              <PenLine className="h-4 w-4 mr-1" />
                              {signDocument.isPending ? "Signing..." : "Confirm Signature"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setSigningDoc(null); setSignatureName(""); }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-blue-500 hover:bg-blue-600"
                          onClick={() => setSigningDoc(doc.id)}
                        >
                          <PenLine className="h-4 w-4 mr-1" />
                          Review & Sign
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {signedSigs.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-lime-500" />
                    Signed Documents
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {signedSigs.map((doc) => (
                    <div key={doc.id} className="p-3 bg-lime-50 rounded-lg flex items-center gap-3">
                      <CheckCircle className="h-4 w-4 text-lime-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{doc.title}</p>
                        <p className="text-xs text-slate-500">
                          Signed by {doc.signedBy} on {doc.signedAt ? format(new Date(doc.signedAt), "MMM d, yyyy") : ""}
                        </p>
                      </div>
                      <Badge variant="default" className="text-xs bg-lime-500">Signed</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {pendingSigs.length === 0 && signedSigs.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <FileSignature className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No signature documents</p>
                <p className="text-sm">Your bookkeeper has not sent any documents for signature.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
