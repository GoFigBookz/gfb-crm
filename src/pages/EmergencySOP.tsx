import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Phone, Shield, Server, FileText, RefreshCw, CheckSquare, ExternalLink } from "lucide-react";

const SOPS = [
  {
    title: "AI Receipt Processing Goes Down",
    severity: "high",
    icon: <FileText className="h-5 w-5" />,
    steps: [
      "Switch to manual receipt entry in QBO",
      "Ask clients to send receipts via email (not portal upload)",
      "Use phone camera + QBO mobile app for quick capture",
      "Create a temporary Google Sheet for batch entry",
      "Log all unprocessed receipts in the Monthly Close checklist notes",
      "When AI is back: re-queue all receipts from the backup Sheet",
    ],
  },
  {
    title: "QBO Disconnects / Token Expires",
    severity: "high",
    icon: <Server className="h-5 w-5" />,
    steps: [
      "Check Integrations page for connection status",
      "Re-authenticate via QBO OAuth flow",
      "If repeated failures: check Intuit Developer dashboard for app status",
      "Verify client QBO companies are still active (not cancelled)",
      "Run manual sync for each firm after reconnection",
      "Verify last-synced timestamps match current date",
    ],
  },
  {
    title: "CRM Server Down",
    severity: "critical",
    icon: <AlertTriangle className="h-5 w-5" />,
    steps: [
      "Switch to ClickUp backup for task management",
      "Use Google Drive for document storage and sharing",
      "Email clients directly (bypass portal)",
      "Use personal calendar for deadline tracking",
      "Take notes in Google Docs — transfer to CRM when restored",
      "Contact hosting provider / check server logs",
      "Restore from latest database backup if needed",
    ],
  },
  {
    title: "Client Portal Link Expires / Client Can't Access",
    severity: "medium",
    icon: <Shield className="h-5 w-5" />,
    steps: [
      "Go to Portal Settings → select client",
      "Generate a new access link",
      "Send directly via email with instructions",
      "If repeated issues: verify client's email address",
      "Offer alternative: direct email with file attachments",
    ],
  },
  {
    title: "Email Account Disconnects (Gmail/Outlook)",
    severity: "medium",
    icon: <RefreshCw className="h-5 w-5" />,
    steps: [
      "Check Integrations page for account status",
      "Re-authenticate the connected account",
      "If token revoked: client may need to re-approve app permissions",
      "Use backup email account for urgent sends",
      "Check Google's Security alerts page for blocks",
    ],
  },
  {
    title: "Staff Member Unavailable (Sick/Vacation)",
    severity: "medium",
    icon: <Phone className="h-5 w-5" />,
    steps: [
      "Check Staff Workload dashboard for capacity",
      "Reassign open tasks to available staff",
      "Notify affected clients of temporary contact change",
      "Update CRM task assignments",
      "Review deadlines — request extensions if needed",
    ],
  },
  {
    title: "CRA / IRS Portal Down at Deadline",
    severity: "high",
    icon: <CheckSquare className="h-5 w-5" />,
    steps: [
      "Screenshot the outage page as proof",
      "Call CRA Business Enquiries: 1-800-959-5525 (CA)",
      "Document attempt timestamp",
      "File as soon as portal is restored",
      "If penalty assessed: submit RC4288 (CA) with outage documentation",
    ],
  },
];

export default function EmergencySOP() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-red-500" />
          Emergency Recovery SOP
        </h1>
        <p className="text-slate-500 mt-1">What to do when systems fail. Print this page and keep it accessible.</p>
      </div>

      <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
        <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-red-700">
          <span className="font-medium">Keep this page bookmarked on your phone.</span> If the CRM is down, you need these procedures accessible.
          Consider printing a copy for your desk.
        </p>
      </div>

      {SOPS.map((sop) => (
        <Card key={sop.title} className={
          sop.severity === "critical" ? "border-red-300" :
          sop.severity === "high" ? "border-amber-300" : "border-slate-200"
        }>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                sop.severity === "critical" ? "bg-red-100 text-red-600" :
                sop.severity === "high" ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"
              }`}>
                {sop.icon}
              </div>
              <div>
                <CardTitle className="text-base">{sop.title}</CardTitle>
                <Badge variant="outline" className={
                  sop.severity === "critical" ? "text-red-600 border-red-300" :
                  sop.severity === "high" ? "text-amber-600 border-amber-300" : "text-blue-600 border-blue-300"
                }>{sop.severity}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {sop.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-600">{i + 1}</span>
                  <span className="text-slate-700">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ))}

      <div className="text-center text-sm text-slate-400 pt-4">
        <p>Last updated: {new Date().toLocaleDateString("en-CA")} | Go Fig Bookz CRM</p>
      </div>
    </div>
  );
}
