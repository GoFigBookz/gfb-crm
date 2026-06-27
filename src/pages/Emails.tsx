import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Search, Send, Reply, Star, MailOpen, Mail, Trash2, Plus, ChevronLeft, Paperclip, X, User, Building2, Inbox, Send as SentIcon, Star as StarredIcon, Clock, FileText, RefreshCw, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ComposeAssist } from "@/components/ComposeAssist";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/providers/trpc";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";

export default function Emails() {
  const utils = trpc.useUtils();
  const [folder, setFolder] = useState<"all" | "inbox" | "sent" | "starred">("inbox");
  const [search, setSearch] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<number | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<number | null>(null);

  // Compose form
  const [composeForm, setComposeForm] = useState({
    connectedAccountId: "",
    to: "",
    cc: "",
    subject: "",
    body: "",
  });

  // Reply form
  const [replyBody, setReplyBody] = useState("");

  const { data: emailList } = trpc.email.list.useQuery({
    folder,
    search: search || undefined,
    limit: 50,
  });

  const { data: emailStats } = trpc.email.stats.useQuery();

  const { data: selectedEmailData } = trpc.email.getById.useQuery(
    { id: selectedEmail! },
    { enabled: !!selectedEmail }
  );

  const { data: threadEmails } = trpc.email.getThread.useQuery(
    { threadId: selectedEmailData?.threadId || "" },
    { enabled: !!selectedEmailData?.threadId }
  );

  const { data: clients } = trpc.crmClient.list.useQuery();
  const { data: connectedAccounts } = trpc.integration.list.useQuery();

  // Gmail auto-sync. Uses the FIRM-WIDE Google account accessor (same proven path the
  // Calendar uses) so it works regardless of which user row the OAuth landed on. Runs
  // once automatically on page load + an explicit "Sync" button — no hunting on Integrations.
  const { data: firmAcct } = trpc.googleSync.firmAccount.useQuery();
  const googleAcct = firmAcct?.connected ? firmAcct : null;
  const syncGmail = trpc.googleSync.syncGmail.useMutation({
    onSuccess: () => { utils.email.list.invalidate(); utils.email.stats.invalidate(); },
  });
  const doSync = () => { if (googleAcct?.id) syncGmail.mutate({ accountId: googleAcct.id, maxResults: 100 }); };
  const [autoSynced, setAutoSynced] = useState(false);
  useEffect(() => {
    if (googleAcct && !autoSynced) { setAutoSynced(true); doSync(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleAcct, autoSynced]);
  const { data: clientEmails } = trpc.email.getClientEmails.useQuery(
    { clientId: selectedClient! },
    { enabled: !!selectedClient }
  );

  const markRead = trpc.email.markRead.useMutation({
    onSuccess: () => {
      utils.email.list.invalidate();
      utils.email.stats.invalidate();
    },
  });

  const toggleStar = trpc.email.toggleStar.useMutation({
    onSuccess: () => utils.email.list.invalidate(),
  });

  const sendEmail = trpc.email.send.useMutation({
    onSuccess: () => {
      utils.email.list.invalidate();
      utils.email.stats.invalidate();
      setComposeOpen(false);
      setComposeForm({ connectedAccountId: "", to: "", cc: "", subject: "", body: "" });
    },
  });

  const replyEmail = trpc.email.reply.useMutation({
    onSuccess: () => {
      utils.email.list.invalidate();
      utils.email.getThread.invalidate();
      setReplyOpen(false);
      setReplyBody("");
    },
  });

  const handleSelectEmail = (id: number) => {
    setSelectedEmail(id);
    // Auto-mark as read
    const email = emailList?.find((e) => e.id === id);
    if (email && !email.isRead) {
      markRead.mutate({ id, isRead: true });
    }
  };

  const handleReply = () => {
    if (!selectedEmail || !replyBody.trim()) return;
    replyEmail.mutate({ emailId: selectedEmail, body: replyBody });
  };

  const handleSend = () => {
    if (!composeForm.connectedAccountId || !composeForm.to || !composeForm.subject || !composeForm.body) return;
    sendEmail.mutate({
      connectedAccountId: Number(composeForm.connectedAccountId),
      clientId: selectedClient || undefined,
      to: composeForm.to,
      cc: composeForm.cc || undefined,
      subject: composeForm.subject,
      body: composeForm.body,
    });
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "";
    const d = new Date(date);
    if (isToday(d)) return format(d, "h:mm a");
    if (isYesterday(d)) return "Yesterday";
    return format(d, "MMM d");
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Emails</h1>
          <p className="text-slate-500">
            {emailStats ? (
              <>
                {emailStats.unread > 0 && (
                  <Badge variant="destructive" className="mr-2">{emailStats.unread} unread</Badge>
                )}
                {emailStats.sent} sent, {emailStats.starred} starred
              </>
            ) : "Loading..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={doSync} disabled={!googleAcct || syncGmail.isPending} title={googleAcct ? "Pull your Gmail into the CRM (keeps only client emails)" : "Connect Google in Integrations first"}>
            <RefreshCw className={cn("h-4 w-4 mr-2", syncGmail.isPending && "animate-spin")} />
            {syncGmail.isPending ? "Syncing…" : "Sync Gmail"}
          </Button>
          <Button className="bg-lime-500" onClick={() => setComposeOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Compose
          </Button>
        </div>
      </div>

      {/* Sync status — shows the result so it's never a mystery whether it ran. */}
      {!googleAcct && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> No Google account connected — connect it in <Link to="/integrations" className="underline font-medium">Integrations</Link>, then come back.
        </div>
      )}
      {syncGmail.isError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> Gmail sync failed: {(syncGmail.error as any)?.message || "unknown error"}
        </div>
      )}
      {syncGmail.data && (
        <div className="text-xs text-slate-500">
          Last sync: pulled <b>{syncGmail.data.synced}</b> new client email{syncGmail.data.synced === 1 ? "" : "s"}
          {typeof syncGmail.data.skippedNonClient === "number" && <> · skipped {syncGmail.data.skippedNonClient} non-client of {syncGmail.data.totalInBatch}</>}.
          {syncGmail.data.synced === 0 && syncGmail.data.skippedNonClient > 0 && <span className="text-amber-600"> (Inbox shows client emails only — the skipped ones weren't to/from a client on file.)</span>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Email List */}
        <div className="lg:col-span-2 space-y-3">
          {/* Search + Tabs */}
          <Card>
            <CardContent className="p-3">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search emails..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Tabs value={folder} onValueChange={(v) => setFolder(v as any)}>
                <TabsList className="grid grid-cols-4">
                  <TabsTrigger value="inbox"><Inbox className="h-4 w-4 mr-1" /> Inbox</TabsTrigger>
                  <TabsTrigger value="sent"><SentIcon className="h-4 w-4 mr-1" /> Sent</TabsTrigger>
                  <TabsTrigger value="starred"><StarredIcon className="h-4 w-4 mr-1" /> Starred</TabsTrigger>
                  <TabsTrigger value="all"><FileText className="h-4 w-4 mr-1" /> All</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>

          {/* Email Items */}
          {emailList && emailList.length > 0 ? (
            <div className="space-y-2">
              {emailList.map((email) => (
                <Card
                  key={email.id}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-slate-50",
                    selectedEmail === email.id && "ring-2 ring-lime-500 bg-lime-50",
                    !email.isRead && !email.isSent && "bg-white border-l-4 border-l-lime-500"
                  )}
                  onClick={() => handleSelectEmail(email.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStar.mutate({ id: email.id, isStarred: !email.isStarred });
                        }}
                        className="mt-1"
                      >
                        <Star className={cn("h-5 w-5", email.isStarred ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={cn("font-medium truncate", !email.isRead && !email.isSent && "font-bold")}>
                              {email.isSent ? `To: ${email.toAddresses}` : email.fromName || email.fromAddress}
                            </span>
                            {email.clientId && clients?.find((c) => c.id === email.clientId) && (
                              <Badge variant="outline" className="text-xs">
                                <Building2 className="h-3 w-3 mr-1" />
                                {clients.find((c) => c.id === email.clientId)?.name}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 whitespace-nowrap ml-2">
                            {formatDate(email.receivedAt)}
                          </span>
                        </div>
                        <p className={cn("text-sm truncate mt-0.5", !email.isRead && !email.isSent ? "text-slate-900 font-medium" : "text-slate-500")}>
                          {email.subject || "(no subject)"}
                        </p>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {email.bodyPlain?.substring(0, 100) || ""}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <Mail className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p>No emails in this folder.</p>
            </div>
          )}
        </div>

        {/* Email Detail / Thread View */}
        <div className="space-y-3">
          {selectedEmailData ? (
            <Card className="h-full">
              <CardContent className="p-4 space-y-4">
                {/* Thread header */}
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedEmail(null)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h3 className="font-semibold">{selectedEmailData.subject || "(no subject)"}</h3>
                  </div>
                  <div className="flex gap-1">
                    {!selectedEmailData.isSent && (
                      <Button variant="ghost" size="sm" onClick={() => setReplyOpen(true)}>
                        <Reply className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleStar.mutate({ id: selectedEmailData.id, isStarred: !selectedEmailData.isStarred })}
                    >
                      <Star className={cn("h-4 w-4", selectedEmailData.isStarred ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
                    </Button>
                  </div>
                </div>

                {/* Thread messages */}
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                  {(threadEmails || [selectedEmailData]).map((msg) => (
                    <div key={msg.id} className={cn("p-3 rounded-lg", msg.isSent ? "bg-lime-50 ml-4" : "bg-slate-50 mr-4")}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-400" />
                          <span className="text-sm font-medium">{msg.isSent ? "You" : (msg.fromName || msg.fromAddress)}</span>
                          <span className="text-xs text-slate-400">{msg.fromAddress}</span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {msg.sentAt ? format(new Date(msg.sentAt), "MMM d, h:mm a") : format(new Date(msg.receivedAt), "MMM d, h:mm a")}
                        </span>
                      </div>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap">{msg.body || msg.bodyPlain}</div>
                      {msg.toAddresses && (
                        <div className="text-xs text-slate-400 mt-1">
                          To: {msg.toAddresses}
                          {msg.ccAddresses && ` • CC: ${msg.ccAddresses}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Reply button */}
                {!selectedEmailData.isSent && (
                  <Button className="w-full bg-lime-500" onClick={() => setReplyOpen(true)}>
                    <Reply className="h-4 w-4 mr-2" /> Reply
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="text-center text-slate-400 py-12">
                <MailOpen className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p>Select an email to view</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Compose Dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-lime-500" />
              Compose Email
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* From */}
            <div className="space-y-2">
              <Label>From (Connected Account)</Label>
              <Select
                value={composeForm.connectedAccountId}
                onValueChange={(v) => setComposeForm((f) => ({ ...f, connectedAccountId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select email account..." />
                </SelectTrigger>
                <SelectContent>
                  {connectedAccounts?.map((acct) => (
                    <SelectItem key={acct.id} value={String(acct.id)}>
                      {acct.accountEmail} ({acct.provider})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Client selector */}
            <div className="space-y-2">
              <Label>Client (optional)</Label>
              <Select value={selectedClient?.toString() || ""} onValueChange={(v) => setSelectedClient(Number(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client to pull email addresses..." />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clientEmails && clientEmails.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {clientEmails.map((ce) => (
                    <Badge
                      key={ce.id}
                      variant={ce.isDefault ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setComposeForm((f) => ({ ...f, to: ce.email }))}
                    >
                      {ce.email} <span className="text-xs opacity-70 ml-1">({ce.label})</span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* To */}
            <div className="space-y-2">
              <Label>To *</Label>
              <Input
                type="email"
                placeholder="recipient@example.com"
                value={composeForm.to}
                onChange={(e) => setComposeForm((f) => ({ ...f, to: e.target.value }))}
              />
            </div>

            {/* CC */}
            <div className="space-y-2">
              <Label>CC</Label>
              <Input
                type="email"
                placeholder="cc@example.com"
                value={composeForm.cc}
                onChange={(e) => setComposeForm((f) => ({ ...f, cc: e.target.value }))}
              />
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <Label>Subject *</Label>
              <Input
                placeholder="Email subject"
                value={composeForm.subject}
                onChange={(e) => setComposeForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>

            {/* Body */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Body *</Label>
                <ComposeAssist value={composeForm.body} onChange={(t) => setComposeForm((f) => ({ ...f, body: t }))} />
              </div>
              <Textarea
                placeholder="Write your message..."
                rows={8}
                value={composeForm.body}
                onChange={(e) => setComposeForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>

            {sendEmail.isError && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Couldn't send: {(sendEmail.error as any)?.message || "unknown error"}</span>
              </div>
            )}
            {!composeForm.connectedAccountId && (
              <p className="text-xs text-amber-600">Pick the account to send <b>from</b> at the top of this form first.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setComposeOpen(false)}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button
                className="bg-lime-500"
                disabled={sendEmail.isPending || !composeForm.connectedAccountId || !composeForm.to || !composeForm.subject || !composeForm.body}
                onClick={handleSend}
              >
                <Send className="h-4 w-4 mr-2" />
                {sendEmail.isPending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reply Dialog */}
      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Reply className="h-5 w-5 text-lime-500" />
              Reply to {selectedEmailData?.fromName || selectedEmailData?.fromAddress}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-slate-50 p-3 rounded-lg text-sm">
              <p className="font-medium">{selectedEmailData?.subject}</p>
              <p className="text-slate-500 mt-1 line-clamp-2">{selectedEmailData?.bodyPlain?.substring(0, 200)}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Reply</Label>
                <ComposeAssist value={replyBody} onChange={setReplyBody} />
              </div>
              <Textarea
                placeholder="Write your reply..."
                rows={6}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReplyOpen(false)}>Cancel</Button>
              <Button
                className="bg-lime-500"
                disabled={replyEmail.isPending || !replyBody.trim()}
                onClick={handleReply}
              >
                <Reply className="h-4 w-4 mr-2" />
                {replyEmail.isPending ? "Sending..." : "Reply"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
