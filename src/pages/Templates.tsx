import { useState } from "react";
import { FileSpreadsheet, Copy, Check, Mail, Bell, FileText, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, ArrowUpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  title: string;
  content: string;
  category: string;
}

const TEMPLATES: Template[] = [
  // ONBOARDING
  { id: "o1", category: "onboarding", title: "Welcome Email", content: `Hi {{clientName}},

Welcome to Go Fig Bookz! We're excited to be your bookkeeping partner.

To get started, please complete your onboarding form here: {{onboardingLink}}

This will help us understand your business, current setup, and what services you need. It only takes about 10 minutes.

If you have any questions, just reply to this email.

Best,
{{bookkeeperName}}
Go Fig Bookz` },
  { id: "o2", category: "onboarding", title: "Onboarding Follow-Up", content: `Hi {{clientName}},

Just checking in — have you had a chance to fill out the onboarding form yet?

If you're stuck on anything or prefer to go through it over the phone, just let me know and we can book a quick 15-minute call.

Link: {{onboardingLink}}

Thanks!
{{bookkeeperName}}` },
  { id: "o3", category: "onboarding", title: "Engagement Letter Follow-Up", content: `Hi {{clientName}},

I've sent over our engagement letter outlining the services, fees, and terms of our engagement.

Please review and sign when you're ready. Once that's back, we can officially get started on your books!

Let me know if you have any questions about the terms.

Best,
{{bookkeeperName}}` },
  // MONTHLY
  { id: "m1", category: "monthly", title: "Monthly Books Complete", content: `Hi {{clientName}},

Your {{month}} books are complete! Here's a summary:

- Bank accounts: {{bankCount}} reconciled
- Transactions processed: {{transactionCount}}
- GST/HST collected: \${{gstCollected}}
- GST/HST paid (ITCs): \${{gstPaid}}
- Net GST/HST owing: \${{gstNet}}

Your financial statements are attached. Please review and let me know if you have any questions.

Next month's deadline: {{nextDeadline}}

Best,
{{bookkeeperName}}` },
  { id: "m2", category: "monthly", title: "Documents Request", content: `Hi {{clientName}},

As we approach month-end, could you please send over:

- Bank statements for {{month}}
- Credit card statements
- Any receipts or invoices not yet uploaded
- Payroll records (if applicable)

You can reply to this email with attachments or upload them to our shared folder.

Thanks!
{{bookkeeperName}}` },
  { id: "m3", category: "monthly", title: "GST/HST Reminder", content: `Hi {{clientName}},

Friendly reminder — your GST/HST return for {{period}} is due on {{deadline}}.

Based on your books, here's what we're looking at:
- GST/HST collected: \${{gstCollected}}
- Input Tax Credits (ITCs): \${{gstPaid}}
- Net amount {{owingOrRefund}}: \${{gstNet}}

I'll file this on your behalf. Please confirm if there are any additional transactions I should include.

Best,
{{bookkeeperName}}` },
  // PAYROLL
  { id: "p1", category: "payroll", title: "New Employee Setup", content: `Hi {{clientName}},

To add {{employeeName}} to payroll, I need the following:

- Full legal name
- SIN (Social Insurance Number)
- Date of birth
- Hire date / start date
- Pay rate (salary or hourly) and hours per week
- Position and department
- Any benefits (health, dental, RRSP)
- TD1 federal and provincial forms (completed and signed)

Please send these over when you can. I can't process their first pay until I have all of this.

Thanks!
{{bookkeeperName}}` },
  { id: "p2", category: "payroll", title: "Payroll Complete", content: `Hi {{clientName}},

Payroll for {{payPeriod}} has been processed:

- Pay date: {{payDate}}
- Total gross: \${{grossPay}}
- CPP deductions: \${{cpp}}
- EI deductions: \${{ei}}
- Income tax: \${{tax}}
- Net pay: \${{netPay}}

CRA remittance will be submitted by {{remittanceDate}}.

Payslips have been sent to employees.

Best,
{{bookkeeperName}}` },
  { id: "p3", category: "payroll", title: "ROE Request Info", content: `Hi {{clientName}},

To prepare the Record of Employment for {{employeeName}}, I need:

- Last day worked
- Reason for leaving (quit, terminated, layoff, etc.)
- First day worked (if not already on file)
- Any insurable earnings details

Once I have this, I'll file the ROE with Service Canada within 5 calendar days.

Let me know!
{{bookkeeperName}}` },
  // YEAR-END
  { id: "y1", category: "yearend", title: "Year-End Prep Notice", content: `Hi {{clientName}},

With {{fiscalYear}} year-end approaching on {{yearEndDate}}, here's what we need to do:

1. Ensure all transactions through {{yearEndDate}} are recorded
2. Reconcile all bank and credit card accounts
3. Verify accounts payable and receivable
4. Review and record any year-end adjustments
5. Prepare T4/T4A slips (if you have employees)
6. File final GST/HST return
7. Generate year-end financial statements

Please send any outstanding receipts, invoices, or documents by {{documentDeadline}}.

I'll have your year-end package ready by {{packageDeadline}}.

Best,
{{bookkeeperName}}` },
  { id: "y2", category: "yearend", title: "T4 Slips Ready", content: `Hi {{clientName}},

The T4 slips for {{taxYear}} are ready for your review:

{{employeeList}}

Please review the amounts and confirm everything looks correct. I'll file with CRA by the January 31 deadline once you approve.

Let me know if you spot any issues!

Best,
{{bookkeeperName}}` },
  // FOLLOW-UP
  { id: "f1", category: "followup", title: "Outstanding Items Reminder", content: `Hi {{clientName}},

Just a friendly follow-up on a few outstanding items:

{{outstandingItems}}

These are needed so I can keep your books up to date. Let me know if you have any questions!

Thanks,
{{bookkeeperName}}` },
  // FOLLOW-UP
  { id: "f1", category: "followup", title: "Outstanding Items Reminder", content: `Hi {{clientName}},

Just a friendly follow-up on a few outstanding items:

{{outstandingItems}}

These are needed so I can keep your books up to date. Let me know if you have any questions!

Thanks,
{{bookkeeperName}}` },
  { id: "f2", category: "followup", title: "Payment Reminder (Client Owes)", content: `Hi {{clientName}},

This is a friendly reminder that your invoice for {{invoicePeriod}} in the amount of \${{amount}} is due on {{dueDate}}.

You can pay by e-transfer to: {{paymentEmail}}

If you've already sent payment, please disregard this message.

Thanks!
{{bookkeeperName}}
Go Fig Bookz` },
  // CALL SCRIPTS
  { id: "c1", category: "calls", title: "Discovery Call Script", content: `[OPENING — 1-2 min]
Hi {{clientName}}, thanks for taking the time to chat today. I'm {{bookkeeperName}} from Go Fig Bookz. Before we dive in, how's your day going?

[PURPOSE — 30 sec]
The goal for today's call is simple: I want to understand where your business is at financially, what's working, what's not, and whether we're a good fit to help. There's no pressure — just a conversation.

[QUESTION 1 — Current Setup]
Let's start with the basics. How are you currently handling your books? Are you doing it yourself, does someone on your team handle it, or have you worked with a bookkeeper before?
  → If DIY: What tools are you using — spreadsheets, QuickBooks, something else?
  → If previous bookkeeper: What prompted the change?
  → If overwhelmed: I hear that a lot. What part is the most frustrating?

[QUESTION 2 — Pain Points]
What would you say is the biggest bookkeeping or accounting headache for you right now? 
  → Common prompts:
    - "Are you confident your numbers are accurate?"
    - "Do you know your profit margins month to month?"
    - "Is tax season stressful because things aren't organized?"
    - "Are you spending time on books that you'd rather spend on growing the business?"

[QUESTION 3 — Business Snapshot]
Tell me a bit about your business:
  - How long have you been operating?
  - What's your approximate monthly revenue range?
  - How many transactions do you typically have per month?
  - Do you have employees or subcontractors?
  - Are you registered for GST/HST?

[QUESTION 4 — Goals]
If we were having this conversation a year from now and your bookkeeping was completely handled, what would that look like for you? What would be different in your day-to-day?

[QUESTION 5 — Decision Process]
If it makes sense for us to work together after today, what does your decision process look like? Is it just you, or do you have a business partner, spouse, or accountant who needs to weigh in?

[YOUR PITCH — 2 min]
Based on what you've shared, here's how Go Fig Bookz typically helps businesses like yours:
  [Tailor to their pain points — e.g.:]
  - "We'll get your books caught up and keep them current monthly"
  - "We'll handle your GST/HST filings so you never miss a deadline"
  - "You'll get clear financial reports so you can make smarter decisions"
  - "We'll manage payroll and remittances end-to-end"

Our clients usually start with [Basic/Standard/Premium] package at \${{monthlyFee}}/month, which includes [list 3-4 key services].

[NEXT STEPS — 1 min]
If this sounds like what you need, here's what happens next:
  1. I'll send you a short onboarding form to capture your business details
  2. We'll draft an engagement letter outlining scope and fees
  3. Once that's signed, we'll schedule a kickoff meeting to get access to your accounts
  4. Your first month of clean books starts immediately

[CLOSE]
Do you have any questions for me? Does this feel like the right direction for where you want to take your business?

[If yes] — Perfect. I'll send that onboarding form within the hour. Looking forward to working with you, {{clientName}}.
[If not sure] — Totally understandable. Take your time. I'll send a summary of everything we discussed along with the onboarding link. No rush — it'll be here when you're ready.

Thanks again for your time today!` },
  { id: "c2", category: "calls", title: "Onboarding Meeting Script", content: `[OPENING — 1 min]
Hi {{clientName}}, welcome to Go Fig Bookz! This is our official kickoff meeting — the goal is to get everything we need so we can start taking bookkeeping off your plate immediately.

[AGENDA PREVIEW]
Here's what we'll cover today — takes about 30-45 minutes:
  1. Confirm services and fee structure
  2. Gather access to your accounts (QBO, bank, CRA)
  3. Walk through document sharing process
  4. Set expectations for ongoing communication
  5. Timeline for first deliverable

[SECTION 1 — Services Confirmation — 3 min]
Just to make sure we're aligned, here's what our {{serviceTier}} package includes:
  - {{serviceList}}

Monthly fee: \${{monthlyFee}}
Hourly rate for out-of-scope work: \${{hourlyRate}}/hr

Any questions on scope before we move forward?

[SECTION 2 — Access & Setup — 10 min]
Let's get the technical stuff sorted. I'll need:

  □ QuickBooks Online access (or we'll create a new account)
    → If existing QBO: Need admin invite sent to {{bookkeeperEmail}}
    → If new: We'll set it up and bill the subscription

  □ Bank & credit card online banking access
    → Option A: Read-only online banking login
    → Option B: PDF statements uploaded monthly
    → Option C: Bank feed auto-sync (preferred)

  □ CRA My Business Account access
    → Your Rep ID or login so we can file GST/HST and view notices

  □ Payroll info (if applicable)
    → Current payroll provider login
    → Employee TD1 forms
    → WSIB account number

  □ Google Drive folder invite
    → I'll create a shared folder for receipts, docs, statements
    → You'll get a link to upload anything anytime

[SECTION 3 — Document Process — 5 min]
Here's how we'll handle documents going forward:

RECEIPTS:
  - Best: Upload to the Google Drive folder as they come in
  - Good: Send photos via email at month-end
  - OK: Drop off a shoebox — we won't judge!

STATEMENTS:
  - We'll pull bank feeds automatically where possible
  - Any missing statements, we'll request via the client portal
  - You'll get a "missing items" list if anything's outstanding

INVOICES & BILLS:
  - If you create invoices in QBO, great — we'll reconcile
  - If you use another system (Stripe, Square, Jobber), let us know

[SECTION 4 — Communication Cadence — 3 min]
Here's how we'll stay in touch:

  - Monthly financials: Delivered by the 15th of the following month
  - GST/HST: Filed 3-5 days before deadline
  - Payroll: Processed 2 days before pay date
  - Urgent items: Email or portal notification
  - Check-in calls: Quarterly (or monthly if you prefer)

You'll also get access to the client portal where you can:
  - View your financial snapshot anytime
  - Upload documents
  - See what items we need from you
  - Track task status

[SECTION 5 — First Deliverable Timeline — 2 min]

CLEANUP (if needed):
  - We'll assess how far behind the books are
  - Cleanup fee: \${{cleanupFee}} (one-time, if applicable)
  - Timeline: {{cleanupWeeks}} weeks

ONGOING (starting month 1):
  - First monthly close: {{firstCloseDate}}
  - First financial statements: {{firstStatementDate}}

[Anything else I should know about your business before we start?]

[WRAP-UP]
Thanks {{clientName}}! You should receive:
  1. Engagement letter for e-signature (within 1 hour)
  2. Portal access link (once letter is signed)
  3. Google Drive folder invite
  4. First "missing items" list (if cleanup is needed)

I'm excited to get your books sorted. Any final questions?

Great — talk soon!` },
  { id: "c3", category: "calls", title: "Check-In Call Script", content: `[OPENING — 1-2 min]
Hi {{clientName}}! It's {{bookkeeperName}} from Go Fig Bookz. Just our regular check-in — how's everything going on your end?

[BUSINESS PULSE — 3 min]
Before we get into the numbers, how's business been since we last spoke?
  - Any big wins, new clients, or busy seasons coming up?
  - Any challenges or changes we should know about?
  - Are you hiring, expanding, or making any big purchases?

→ [Note anything that affects books: new employees, equipment purchases, office move, new revenue streams, etc.]

[BOOKS REVIEW — 5 min]
Let me quickly walk you through where things stand:

LAST MONTH'S FINANCIALS:
  - Revenue: \${{revenue}} [↑/↓ vs prior month]
  - Expenses: \${{expenses}} [↑/↓ vs prior month]
  - Net income: \${{netIncome}} [↑/↓ vs prior month]
  - Any unusual transactions I should explain?

UPCOMING DEADLINES:
  - {{upcomingDeadlines}}
  - Everything on track — no surprises

CASH FLOW SNAPSHOT:
  - Bank balance: \${{bankBalance}}
  - Outstanding A/R: \${{arOutstanding}}
  - Any invoices you want me to follow up on?

[OPEN QUESTIONS — 3 min]
Here's where I turn it over to you:

  1. "Are the financial reports giving you what you need to make decisions? Is there anything you'd like to see differently?"

  2. "Is the document-sharing process working for you? Any friction getting receipts or statements to us?"

  3. "Are there any services we're NOT currently providing that would make your life easier?"
     → Common additions: payroll, accounts payable management, budgeting, cash flow forecasting

  4. "On a scale of 1-10, how would you rate our service so far? What would make it a 10?"

[MISSING ITEMS — 2 min]
Any outstanding documents we need:
  {{missingItemsList}}
  → [If any] — I'll also send a portal reminder after this call

[COMPLIANCE & ADVISORY — 2 min]
  - GST/HST: {{gstStatus}}
  - Payroll remittances: {{payrollStatus}}
  - Any CRA notices or letters come in? Forward them to me right away.
  - Are you talking to your accountant about tax planning? I can provide year-to-date numbers anytime.

[CLOSE — 1 min]
Alright {{clientName}}, that's everything from my side. You're all set for {{nextPeriod}}.

  - Next deliverable: {{nextDeliverable}}
  - Next check-in: {{nextCheckInDate}}
  - If anything comes up before then, just email or drop it in the portal.

Thanks as always for your time — really appreciate how organized you've been with documents [or: let's work together to get that document flow smoother].

Talk soon!` },
  { id: "c4", category: "calls", title: "Fee Increase Conversation Script", content: `[PRE-CALL PREP — Before You Dial]
  - Know your numbers: current fee, new fee, difference, % increase
  - Have the reason ready: scope creep, additional services, market rates, cost of living
  - Know your walk-away point and be prepared to offer alternatives
  - Timing: 60-90 days before the increase takes effect

[OPENING — 1 min]
Hi {{clientName}}, thanks for making time. I wanted to have a direct conversation with you about something important — our bookkeeping engagement. First, how's everything going on your end?

[CONTEXT — 2 min]
I really value our working relationship. You've been with us for {{duration}} now, and it's been great to see your business grow [mention specific growth if applicable].

As your business has evolved, so has the work required to keep your books accurate and compliant. Over the past {{reviewPeriod}}, I've noticed:
  - {{change1}} [e.g., transaction volume has increased 40%]
  - {{change2}} [e.g., we added payroll processing]
  - {{change3}} [e.g., additional bank accounts were opened]
  - {{change4}} [e.g., more complex GST/HST filings]

[THE INCREASE — 2 min]
Because of this expanded scope, I need to adjust our monthly fee to reflect the actual work involved and maintain the quality of service you expect.

  Current fee: \${{currentFee}}/month
  New fee: \${{newFee}}/month
  Difference: +\${{difference}}/month ({{percentIncrease}}%)
  Effective date: {{effectiveDate}}

[WHAT'S INCLUDED — 2 min]
This fee covers:
  {{serviceList}}

And I'm also adding [if applicable]:
  - {{newBenefit1}} [e.g., quarterly advisory call]
  - {{newBenefit2}} [e.g., priority support response]

[ADDRESS CONCERNS — Handle Objections]

[If they ask "Why now?"]
"I typically review fees annually, and it's been {{monthsSinceLastIncrease}} since our last adjustment. This increase brings our rate in line with the scope of work and current market rates for the level of service you're receiving."

[If they say it's too much]
"I completely understand. Budget is always a consideration. Let's look at a few options:
  Option A: We phase it in — \${{phasedFee1}} for the first 3 months, then \${{newFee}} after that.
  Option B: We adjust scope — maybe we handle {{reducedScope}} and you keep {{clientRetainedScope}} in-house.
  Option C: We keep the current fee but move to quarterly instead of monthly closes."

[If they threaten to leave]
"I don't want to lose you as a client — you've been great to work with. What would make this work for your budget? If there's a way to adjust scope or timing, I'm open to finding a solution. But I do need the fee to reflect the time and expertise your books require."

[If they're understanding]
"Thank you for that — I really appreciate you seeing the value in what we do. My goal is always to make sure your books are a source of confidence, not stress."

[NEXT STEPS — 1 min]
Here's what happens next:
  1. I'll send an updated engagement letter reflecting the new fee
  2. It takes effect on {{effectiveDate}}
  3. No interruption to service — everything continues as normal

[If they need time to decide]
"Absolutely — take whatever time you need. I'll send the details in writing today. Let's reconnect by {{decisionDeadline}}. Does that work?"

[If they accept]
"Great — I'll get that updated engagement letter out today. Thank you for your continued trust, {{clientName}}."

[CLOSE]
Any questions before we wrap up?

Thanks for taking the time to talk this through. I really appreciate it. Have a great rest of your day!` },
];

export default function Templates() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("calls");

  const copy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const tabs = [
    { value: "calls", label: "Call Scripts", icon: Phone },
    { value: "onboarding", label: "Onboarding", icon: FileText },
    { value: "monthly", label: "Monthly", icon: Mail },
    { value: "payroll", label: "Payroll", icon: MessageSquare },
    { value: "yearend", label: "Year-End", icon: Bell },
    { value: "followup", label: "Follow-Up", icon: MessageSquare },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-lime-500" />
          Communication Templates
        </h1>
        <p className="text-slate-500">Pre-written emails, call scripts, and messages for common bookkeeper scenarios</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="flex items-center gap-1.5">
              <t.icon className="h-4 w-4" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="space-y-3 mt-4">
            {TEMPLATES.filter((t) => t.category === tab.value).map((template) => (
              <Card key={template.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{template.title}</CardTitle>
                    <Button
                      size="sm"
                      variant={copiedId === template.id ? "default" : "outline"}
                      className={cn(copiedId === template.id && "bg-lime-500")}
                      onClick={() => copy(template.content, template.id)}
                    >
                      {copiedId === template.id ? (
                        <><Check className="h-3 w-3 mr-1" /> Copied</>
                      ) : (
                        <><Copy className="h-3 w-3 mr-1" /> Copy</>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">
                    {template.content}
                  </pre>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
