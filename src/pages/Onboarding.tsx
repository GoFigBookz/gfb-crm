import { useState } from "react";
import { FileText, Send, CheckCircle, Clock, Link2, Mail, UserCheck, Building2, Receipt, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";

export default function Onboarding() {
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [assignTo, setAssignTo] = useState<string>("");

  const { data: clients } = trpc.crmClient.list.useQuery();
  const { data: submissions } = trpc.onboarding.list.useQuery();
  const { data: staffList } = trpc.user.list.useQuery(undefined, { retry: false });
  const createOnboarding = trpc.onboarding.create.useMutation({
    onSuccess: (data) => {
      setGeneratedLink(data.url);
      utils.onboarding.list.invalidate();
    },
  });
  const review = trpc.onboarding.review.useMutation({
    onSuccess: () => {
      utils.onboarding.list.invalidate();
      setReviewingId(null);
      setAssignTo("");
    },
  });

  const utils = trpc.useUtils();
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const reviewingSubmission = submissions?.find(s => s.id === reviewingId);
  const reviewingClient = clients?.find(c => c.id === reviewingSubmission?.clientId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="h-6 w-6 text-lime-500" />
          Client Onboarding
        </h1>
        <p className="text-slate-500">Send onboarding forms and review client submissions</p>
      </div>

      {/* Generate Link */}
      <Card>
        <CardHeader>
          <CardTitle>Send Onboarding Form</CardTitle>
          <CardDescription>Generate a secure link to send to a new client</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Select value={selectedClient?.toString() || ""} onValueChange={(v) => setSelectedClient(Number(v))}>
              <SelectTrigger className="w-80">
                <SelectValue placeholder="Select client..." />
              </SelectTrigger>
              <SelectContent>
                {clients?.filter(c => c.workflowStatus === "new_lead" || c.workflowStatus === "discovery_call").map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => selectedClient && createOnboarding.mutate({ clientId: selectedClient })}
              disabled={!selectedClient || createOnboarding.isPending}
              className="bg-lime-500"
            >
              <Send className="h-4 w-4 mr-2" /> Generate Link
            </Button>
          </div>
          {generatedLink && (
            <div className="bg-lime-50 border border-lime-200 rounded-lg p-4">
              <p className="text-sm text-lime-700 font-medium mb-2">Onboarding link generated!</p>
              <code className="bg-white px-3 py-2 rounded text-sm block break-all">{window.location.origin}{generatedLink}</code>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}${generatedLink}`)}
              >
                <Link2 className="h-3 w-3 mr-1" /> Copy Link
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submissions */}
      <Card>
        <CardHeader>
          <CardTitle>Onboarding Submissions</CardTitle>
          <CardDescription>Review and approve client onboarding forms</CardDescription>
        </CardHeader>
        <CardContent>
          {!submissions || submissions.length === 0 ? (
            <p className="text-center text-slate-400 py-8">No onboarding submissions yet.</p>
          ) : (
            <div className="space-y-3">
              {submissions.map((s) => {
                const client = clients?.find(c => c.id === s.clientId);
                return (
                  <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{client?.name || "Unknown Client"}</p>
                        <Badge variant="outline" className={
                          s.status === "approved" ? "bg-emerald-50 text-emerald-700" :
                          s.status === "submitted" ? "bg-amber-50 text-amber-700" :
                          "bg-slate-100 text-slate-600"
                        }>
                          {s.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {s.submittedAt ? `Submitted ${format(new Date(s.submittedAt), "MMM d, yyyy")}` : "Pending submission"}
                      </p>
                      {s.fiscalYearEnd && (
                        <p className="text-xs text-slate-400 mt-1">
                          <Building2 className="h-3 w-3 inline mr-1" />
                          FYE: {s.fiscalYearEnd} | 
                          <Receipt className="h-3 w-3 inline mx-1" />
                          HST: {s.hstGstFrequency || "N/A"} | 
                          <Users className="h-3 w-3 inline mx-1" />
                          Payroll: {s.payrollFrequency || "N/A"}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {s.status === "submitted" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => review.mutate({ id: s.id, status: "reviewed" })}>
                            <Clock className="h-3 w-3 mr-1" /> Review
                          </Button>
                          <Button size="sm" className="bg-lime-500" onClick={() => setReviewingId(s.id)}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Approve
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <Dialog open={!!reviewingId} onOpenChange={(open) => { if (!open) setReviewingId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-lime-500" />
              Approve Onboarding
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <p className="font-medium">{reviewingClient?.name}</p>
              {reviewingSubmission?.fiscalYearEnd && (
                <p className="text-sm text-slate-500">Fiscal Year End: {reviewingSubmission.fiscalYearEnd}</p>
              )}
              {reviewingSubmission?.hstGstFrequency && reviewingSubmission.hstGstFrequency !== "none" && (
                <p className="text-sm text-slate-500">HST/GST: {reviewingSubmission.hstGstFrequency}</p>
              )}
              {reviewingSubmission?.payrollFrequency && reviewingSubmission.payrollFrequency !== "none" && (
                <p className="text-sm text-slate-500">Payroll: {reviewingSubmission.payrollFrequency}</p>
              )}
              {(reviewingSubmission?.hasEmployees || reviewingSubmission?.hasSubcontractors || reviewingSubmission?.wsibRequired) && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {reviewingSubmission.hasEmployees && <Badge variant="secondary">Has Employees</Badge>}
                  {reviewingSubmission.hasSubcontractors && <Badge variant="secondary">Subcontractors</Badge>}
                  {reviewingSubmission.hasInvestments && <Badge variant="secondary">Investments</Badge>}
                  {reviewingSubmission.wsibRequired && <Badge variant="secondary">WSIB</Badge>}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Assign to Staff Member</Label>
              <Select value={assignTo} onValueChange={setAssignTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff..." />
                </SelectTrigger>
                <SelectContent>
                  {staffList?.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.name || user.email} ({user.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400">
                This person will be assigned all auto-generated recurring tasks for this client.
              </p>
            </div>

            <Button 
              className="w-full bg-lime-500" 
              disabled={review.isPending}
              onClick={() => {
                if (reviewingId) {
                  review.mutate({
                    id: reviewingId,
                    status: "approved",
                    assignedTo: assignTo || undefined,
                  });
                }
              }}
            >
              <UserCheck className="h-4 w-4 mr-2" />
              {review.isPending ? "Creating tasks..." : "Approve & Generate Tasks"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
