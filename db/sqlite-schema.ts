/**
 * CHEAP DEPLOYMENT - SQLite Schema
 * 
 * This is the budget-friendly version of the CRM that uses SQLite
 * instead of MySQL. Perfect for single-user deployments on:
 * - Cheapest VPS ($3-5/month)
 * - Raspberry Pi at home
 * - Free tiers (Render, Railway, Fly.io)
 * - Any shared hosting with Node.js
 */

import {
  sqliteTable,
  integer,
  text,
  real,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// ========== USERS ==========
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  unionId: text("unionId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  avatar: text("avatar"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  lastSignInAt: integer("lastSignInAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CONNECTED ACCOUNTS ==========
export const connectedAccounts = sqliteTable("connected_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  provider: text("provider", { enum: ["google", "microsoft", "dropbox", "icloud"] }).notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  accountLabel: text("accountLabel").default("Primary").notNull(),
  accountEmail: text("accountEmail"),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  expiresAt: integer("expiresAt", { mode: "timestamp" }),
  scopes: text("scopes"),
  isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
  syncEnabled: text("syncEnabled").default('{"email":true,"calendar":true,"files":true,"tasks":true}'),
  lastSyncedAt: integer("lastSyncedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CLIENTS ==========
export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  address: text("address"),
  taxId: text("taxId"),
  status: text("status", { enum: ["active", "inactive", "prospect"] }).default("active").notNull(),
  leadSource: text("leadSource"),
  assignedTo: text("assignedTo"),
  notes: text("notes"),
  googleDriveFolderId: text("googleDriveFolderId"),
  oneDriveFolderId: text("oneDriveFolderId"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== TASKS ==========
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  clientId: integer("clientId"),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: integer("dueDate", { mode: "timestamp" }),
  completed: integer("completed", { mode: "boolean" }).default(false).notNull(),
  priority: text("priority", { enum: ["low", "medium", "high"] }).default("medium").notNull(),
  status: text("status", { enum: ["pending", "in_progress", "completed", "overdue"] }).default("pending").notNull(),
  category: text("category"),
  assignedTo: text("assignedTo"),
  googleCalendarEventId: text("googleCalendarEventId"),
  googleTaskId: text("googleTaskId"),
  outlookTaskId: text("outlookTaskId"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== RECURRING TASKS ==========
export const recurringTasks = sqliteTable("recurring_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  clientId: integer("clientId"),
  title: text("title").notNull(),
  description: text("description"),
  frequency: text("frequency", { enum: ["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"] }).notNull(),
  startDate: integer("startDate", { mode: "timestamp" }).notNull(),
  endDate: integer("endDate", { mode: "timestamp" }),
  priority: text("priority", { enum: ["low", "medium", "high"] }).default("medium").notNull(),
  category: text("category"),
  assignedTo: text("assignedTo"),
  lastGeneratedDate: integer("lastGeneratedDate", { mode: "timestamp" }),
  nextDueDate: integer("nextDueDate", { mode: "timestamp" }).notNull(),
  active: integer("active", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== EMAILS ==========
export const emails = sqliteTable("emails", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  connectedAccountId: integer("connectedAccountId").notNull(),
  clientId: integer("clientId"),
  gmailMessageId: text("gmailMessageId"),
  outlookMessageId: text("outlookMessageId"),
  threadId: text("threadId"),
  fromAddress: text("fromAddress").notNull(),
  fromName: text("fromName"),
  toAddresses: text("toAddresses").notNull(),
  ccAddresses: text("ccAddresses"),
  subject: text("subject"),
  body: text("body"),
  bodyPlain: text("bodyPlain"),
  isRead: integer("isRead", { mode: "boolean" }).default(false).notNull(),
  isStarred: integer("isStarred", { mode: "boolean" }).default(false).notNull(),
  isImportant: integer("isImportant", { mode: "boolean" }).default(false).notNull(),
  labels: text("labels"),
  attachments: text("attachments"),
  receivedAt: integer("receivedAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== FILES ==========
export const files = sqliteTable("files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  clientId: integer("clientId"),
  connectedAccountId: integer("connectedAccountId"),
  provider: text("provider", { enum: ["google_drive", "one_drive", "local"] }).notNull(),
  providerFileId: text("providerFileId"),
  providerParentId: text("providerParentId"),
  name: text("name").notNull(),
  mimeType: text("mimeType"),
  size: integer("size"),
  webViewLink: text("webViewLink"),
  downloadLink: text("downloadLink"),
  thumbnailLink: text("thumbnailLink"),
  isFolder: integer("isFolder", { mode: "boolean" }).default(false).notNull(),
  localPath: text("localPath"),
  syncStatus: text("syncStatus", { enum: ["synced", "pending", "error", "offline"] }).default("synced").notNull(),
  lastSyncedAt: integer("lastSyncedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CALENDAR EVENTS ==========
export const calendarEvents = sqliteTable("calendar_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  clientId: integer("clientId"),
  connectedAccountId: integer("connectedAccountId"),
  taskId: integer("taskId"),
  googleEventId: text("googleEventId"),
  outlookEventId: text("outlookEventId"),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  startDate: integer("startDate", { mode: "timestamp" }).notNull(),
  endDate: integer("endDate", { mode: "timestamp" }).notNull(),
  isAllDay: integer("isAllDay", { mode: "boolean" }).default(false).notNull(),
  attendees: text("attendees"),
  recurrence: text("recurrence"),
  color: text("color"),
  isRecurring: integer("isRecurring", { mode: "boolean" }).default(false).notNull(),
  status: text("status", { enum: ["confirmed", "tentative", "cancelled"] }).default("confirmed").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== INVOICES ==========
export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  clientId: integer("clientId").notNull(),
  invoiceNumber: text("invoiceNumber").notNull(),
  amount: real("amount").notNull(),
  status: text("status", { enum: ["draft", "sent", "paid", "overdue"] }).default("draft").notNull(),
  issueDate: integer("issueDate", { mode: "timestamp" }).notNull(),
  dueDate: integer("dueDate", { mode: "timestamp" }).notNull(),
  paidDate: integer("paidDate", { mode: "timestamp" }),
  description: text("description"),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== INVOICE ITEMS ==========
export const invoiceItems = sqliteTable("invoice_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoiceId").notNull(),
  description: text("description").notNull(),
  quantity: real("quantity").default(1).notNull(),
  rate: real("rate").notNull(),
  amount: real("amount").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== INTERACTIONS ==========
export const interactions = sqliteTable("interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  clientId: integer("clientId").notNull(),
  type: text("type", { enum: ["call", "email", "meeting", "video", "sms", "note", "other"] }).notNull(),
  date: integer("date", { mode: "timestamp" }).notNull(),
  notes: text("notes"),
  assignedTo: text("assignedTo"),
  followUpDate: integer("followUpDate", { mode: "timestamp" }),
  emailId: integer("emailId"),
  calendarEventId: integer("calendarEventId"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== AI AGENT CONFIGS ==========
export const aiAgentConfigs = sqliteTable("ai_agent_configs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  name: text("name").notNull(),
  agentType: text("agentType", { enum: ["bookkeeper", "executive_assistant", "sales_assistant", "customer_support", "custom"] }).notNull(),
  description: text("description"),
  capabilities: text("capabilities").default('{"readEmails":false,"sendEmails":false,"manageCalendar":false,"createTasks":true,"manageInvoices":false,"fileAccess":false,"clientCommunication":true}'),
  webhookUrl: text("webhookUrl"),
  webhookSecret: text("webhookSecret"),
  model: text("model").default("gpt-4"),
  temperature: real("temperature").default(0.7),
  systemPrompt: text("systemPrompt"),
  autoRun: integer("autoRun", { mode: "boolean" }).default(false).notNull(),
  runSchedule: text("runSchedule"),
  lastRunAt: integer("lastRunAt", { mode: "timestamp" }),
  isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== AI AGENT RUNS ==========
export const aiAgentRuns = sqliteTable("ai_agent_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agentId").notNull(),
  userId: integer("userId").notNull(),
  triggerType: text("triggerType", { enum: ["manual", "scheduled", "webhook", "api"] }).notNull(),
  status: text("status", { enum: ["running", "completed", "failed", "cancelled"] }).default("running").notNull(),
  input: text("input"),
  output: text("output"),
  actionsTaken: text("actionsTaken"),
  errorMessage: text("errorMessage"),
  durationMs: integer("durationMs"),
  startedAt: integer("startedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  completedAt: integer("completedAt", { mode: "timestamp" }),
});

// ========== NOTIFICATIONS ==========
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  type: text("type", { enum: ["task_due", "task_overdue", "invoice_overdue", "email_received", "calendar_event", "client_activity", "ai_agent_alert", "system"] }).notNull(),
  title: text("title").notNull(),
  message: text("message"),
  relatedId: integer("relatedId"),
  relatedType: text("relatedType"),
  isRead: integer("isRead", { mode: "boolean" }).default(false).notNull(),
  sentVia: text("sentVia", { enum: ["in_app", "email", "sms", "push"] }).default("in_app").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== USER SETTINGS ==========
export const userSettings = sqliteTable("user_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull().unique(),
  notifyTaskDue: integer("notifyTaskDue", { mode: "boolean" }).default(true).notNull(),
  notifyTaskOverdue: integer("notifyTaskOverdue", { mode: "boolean" }).default(true).notNull(),
  notifyInvoiceOverdue: integer("notifyInvoiceOverdue", { mode: "boolean" }).default(true).notNull(),
  notifyNewEmail: integer("notifyNewEmail", { mode: "boolean" }).default(false).notNull(),
  notifyCalendarEvent: integer("notifyCalendarEvent", { mode: "boolean" }).default(true).notNull(),
  notifyClientActivity: integer("notifyClientActivity", { mode: "boolean" }).default(false).notNull(),
  notifyAIAgent: integer("notifyAIAgent", { mode: "boolean" }).default(true).notNull(),
  dashboardWidgets: text("dashboardWidgets").default('["stats","tasks","emails","calendar"]'),
  defaultView: text("defaultView", { enum: ["dashboard", "clients", "tasks", "emails", "calendar", "files", "invoices"] }).default("dashboard"),
  theme: text("theme", { enum: ["light", "dark", "system"] }).default("system"),
  timezone: text("timezone").default("UTC"),
  dateFormat: text("dateFormat").default("MMM d, yyyy"),
  currency: text("currency").default("USD"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
