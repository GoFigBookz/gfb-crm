import { migrateRouter } from "./migrate-router";
import { voiceRouter } from "./voice-router";
import { googleTasksRouter } from "./google-tasks-router";
import { googleSyncRouter } from "./google-sync-router";
import { microsoftSyncRouter } from "./microsoft-sync-router";
import { dailyBriefRouter } from "./daily-brief-router";
import { localAuthRouter } from "./local-auth-router";
import { authRouter } from "./auth-router";
import { clientRouter } from "./client-router";
import { taskRouter } from "./task-router";
import { integrationRouter } from "./integration-router";
import { emailRouter } from "./email-router";
import { fileRouter } from "./file-router";
import { calendarRouter } from "./calendar-router";
import { invoiceRouter } from "./invoice-router";
import { aiAgentRouter } from "./ai-agent-router";
import { settingsRouter } from "./settings-router";
import { qboRouter } from "./qbo-router";
import { qboBrainRouter } from "./qbo-vendor-brain";
import { vaultRouter } from "./vault-router";
import { onboardingRouter } from "./onboarding-router";
import { clientDashboardRouter } from "./client-dashboard-router";
import { portalRouter } from "./portal-router";
import { govRepRouter } from "./gov-rep-router";
import { workflowRouter } from "./workflow-router";
import { userRouter } from "./user-router";
import { employeeRouter } from "./employee-router";
import { payrollRouter } from "./payroll-router";
import { contactsRouter } from "./contacts-router";
import { partiesRouter } from "./parties-router";
import { dividendRouter } from "./dividend-router";
import { taxSlipRouter } from "./tax-slip-router";
import { clientRequestRouter } from "./client-request-router";
import { messageRouter } from "./message-router";
import { engagementLetterRouter } from "./engagement-letter-router";
import { signatureRouter } from "./signature-router";
import { playbookRouter } from "./playbook-router";
import { timeRouter } from "./time-router";
import { workloadRouter } from "./workload-router";
import { expirationRouter } from "./expiration-router";
import { monthlyCloseRouter } from "./monthly-close-router";
import { monthEndRouter } from "./month-end-router";
import { quoteRouter } from "./quote-router";
import { agentWebhookRouter } from "./agent-webhook-router";
import { sheetExportRouter } from "./sheet-export-router";
import { senderRulesRouter } from "./sender-rules-router";
import { connectorRouter } from "./connector-router";
import { restoreRouter } from "./restore-router";
import { bulkImportRouter } from "./bulk-import-router";
import { intercoRouter } from "./interco-router";
import { intercoRechargeRouter } from "./interco-recharge-router";
import { vendorRulesRouter } from "./vendor-rules-router";
import { statementCodingRouter } from "./statement-coding-router";
import { tasksCleanupRouter } from "./tasks-cleanup-router";
import { cleanupRouter } from "./cleanup-router";
import { groupRouter } from "./group-router";
import { practiceHealthRouter } from "./practice-health-router";
import { groupBookRouter } from "./group-book-router";
import { dashboardRouter } from "./dashboard-router";
import { calculatorRouter } from "./calculator-router";
import { bankConverterRouter } from "./bank-converter-router";
import { pdfSplitterRouter } from "./pdf-splitter-router";
import { assistantRouter } from "./assistant-router";
import { qaRouter } from "./qa-router";
import { personalRouter } from "./personal-router";
import { brainRouter } from "./brain-router";
import { launchpadRouter } from "./launchpad-router";
import { hstAuditRouter } from "./hst-audit-router";
import { subscriptionsRouter } from "./subscriptions-router";
import { registersRouter } from "./registers-router";
import { jadeRouter } from "./jade-router";
import { marketingRouter } from "./marketing-router";
import { lifeRouter } from "./life-router";
import { healthRouter } from "./health-router";
import { phoenixRouter } from "./phoenix-router";
import { learningRouter } from "./learning-router";
import { chatRouter } from "./chat-router";
import { revRecRouter } from "./revrec-router";
import { bankedHoursRouter } from "./banked-hours-router";
import { cashBookRouter } from "./cash-book-router";
import { backupRouter } from "./backup-router";
import { opportunitiesRouter } from "./opportunities-router";
import { cashPositionRouter } from "./cash-position-router";
import { coaRouter } from "./coa-router";
import { driveCleanupRouter } from "./drive-cleanup-router";
import { faxRouter } from "./fax-router";
import { cryptoRouter } from "./crypto-router";
import { surplusCashRouter } from "./surplus-cash-router";
import { reconTrackerRouter } from "./recon-tracker-router";
import { clientThreadRouter } from "./client-thread-router";
import { genealogyRouter } from "./genealogy-router";
import { hstReviewRouter } from "./hst-review-router";
import { loanTrackerRouter } from "./loan-tracker-router";
import { publicRouter } from "./public-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  // NOTE: a second `health:` key (the personal Health Hub router) is registered
  // below and was silently overwriting this status endpoint — renamed to `healthcheck`
  // so both coexist. `ping` also covers liveness.
  healthcheck: publicQuery.query(() => ({ status: "ok", timestamp: new Date().toISOString(), version: "2.0.0" })),
  auth: authRouter,
  crmClient: clientRouter,
  task: taskRouter,
  integration: integrationRouter,
  email: emailRouter,
  file: fileRouter,
  calendar: calendarRouter,
  invoice: invoiceRouter,
  aiAgent: aiAgentRouter,
  settings: settingsRouter,
  qbo: qboRouter,
  qboBrain: qboBrainRouter,
  vault: vaultRouter,
  onboarding: onboardingRouter,
  govRep: govRepRouter,
  workflow: workflowRouter,
  user: userRouter,
  employee: employeeRouter,
  payroll: payrollRouter,
  contacts: contactsRouter,
  parties: partiesRouter,
  dividend: dividendRouter,
  taxSlip: taxSlipRouter,
  clientRequest: clientRequestRouter,
  message: messageRouter,
  engagementLetter: engagementLetterRouter,
  public: publicRouter,
  clientDashboard: clientDashboardRouter,
  portal: portalRouter,
  signature: signatureRouter,
  playbook: playbookRouter,
  time: timeRouter,
  workload: workloadRouter,
  expiration: expirationRouter,
  monthlyClose: monthlyCloseRouter,
  monthEnd: monthEndRouter,
  quote: quoteRouter,
  agentWebhook: agentWebhookRouter,
  sheetExport: sheetExportRouter,
  localAuth: localAuthRouter,
  dailyBrief: dailyBriefRouter,
  googleTasks: googleTasksRouter,
  voice: voiceRouter,
  migrate: migrateRouter,
  senderRules: senderRulesRouter,
  connector: connectorRouter,
  googleSync: googleSyncRouter,
  microsoftSync: microsoftSyncRouter,
  bulkImport: bulkImportRouter,
  restore: restoreRouter,
  interco: intercoRouter,
  intercoRecharge: intercoRechargeRouter,
  vendorRules: vendorRulesRouter,
  statementCoding: statementCodingRouter,
  tasksCleanup: tasksCleanupRouter,
  cleanup: cleanupRouter,
  group: groupRouter,
  practiceHealth: practiceHealthRouter,
  groupBook: groupBookRouter,
  dashboard: dashboardRouter,
  calculator: calculatorRouter,
  bankConverter: bankConverterRouter,
  pdfSplitter: pdfSplitterRouter,
  assistant: assistantRouter,
  jinx: qaRouter,
  personal: personalRouter,
  brain: brainRouter,
  launchpad: launchpadRouter,
  hstAudit: hstAuditRouter,
  hstReview: hstReviewRouter,
  subscriptions: subscriptionsRouter,
  registers: registersRouter,
  jade: jadeRouter,
  marketing: marketingRouter,
  life: lifeRouter,
  health: healthRouter,
  phoenix: phoenixRouter,
  genealogy: genealogyRouter,
  learning: learningRouter,
  chat: chatRouter,
  revRec: revRecRouter,
  bankedHours: bankedHoursRouter,
  cashBook: cashBookRouter,
  backup: backupRouter,
  opportunities: opportunitiesRouter,
  cashPosition: cashPositionRouter,
  coa: coaRouter,
  driveCleanup: driveCleanupRouter,
  fax: faxRouter,
  crypto: cryptoRouter,
  surplusCash: surplusCashRouter,
  reconTracker: reconTrackerRouter,
  clientThread: clientThreadRouter,
  loanTracker: loanTrackerRouter,
});

export type AppRouter = typeof appRouter;
