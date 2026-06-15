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
import { reconcileRouter } from "./reconcile";
import { vaultRouter } from "./vault-router";
import { onboardingRouter } from "./onboarding-router";
import { clientDashboardRouter } from "./client-dashboard-router";
import { portalRouter } from "./portal-router";
import { govRepRouter } from "./gov-rep-router";
import { workflowRouter } from "./workflow-router";
import { userRouter } from "./user-router";
import { employeeRouter } from "./employee-router";
import { engagementLetterRouter } from "./engagement-letter-router";
import { signatureRouter } from "./signature-router";
import { playbookRouter } from "./playbook-router";
import { timeRouter } from "./time-router";
import { workloadRouter } from "./workload-router";
import { expirationRouter } from "./expiration-router";
import { monthlyCloseRouter } from "./monthly-close-router";
import { agentWebhookRouter } from "./agent-webhook-router";
import { sheetExportRouter } from "./sheet-export-router";
import { senderRulesRouter } from "./sender-rules-router";
import { connectorRouter } from "./connector-router";
import { restoreRouter } from "./restore-router";
import { bulkImportRouter } from "./bulk-import-router";
import { publicRouter } from "./public-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  health: publicQuery.query(() => ({ status: "ok", timestamp: new Date().toISOString(), version: "2.0.0" })),
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
  reconcile: reconcileRouter,
  vault: vaultRouter,
  onboarding: onboardingRouter,
  govRep: govRepRouter,
  workflow: workflowRouter,
  user: userRouter,
  employee: employeeRouter,
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
});

export type AppRouter = typeof appRouter;
