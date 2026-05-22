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
  unionId: text("unionId").unique(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatar: text("avatar"),
  role: text("role", { enum: ["admin", "senior_bookkeeper", "junior_bookkeeper", "client"] }).default("junior_bookkeeper").notNull(),
  // Local auth
  passwordHash: text("passwordHash"),
  authProvider: text("authProvider", { enum: ["kimi", "google", "microsoft", "local"] }).default("local").notNull(),
  // Active status
  isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
  // For password reset
  resetToken: text("resetToken"),
  resetTokenExpires: integer("resetTokenExpires", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  lastSignInAt: integer("lastSignInAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CONNECTED ACCOUNTS (Multi-account OAuth) ==========
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

// ========== QBO CONNECTIONS ==========
export const qboConnections = sqliteTable("qbo_connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  realmId: text("realmId").notNull(),
  companyName: text("companyName"),
  companyEmail: text("companyEmail"),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  expiresAt: integer("expiresAt", { mode: "timestamp" }),
  environment: text("environment", { enum: ["sandbox", "production"] }).default("sandbox").notNull(),
  // Multi-account support: personal_business, ca_clients, us_clients
  accountType: text("accountType", { enum: ["personal_business", "ca_clients", "us_clients"] }).default("ca_clients").notNull(),
  isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
  lastSyncedAt: integer("lastSyncedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== QBO SYNC LOGS ==========
export const qboSyncLogs = sqliteTable("qbo_sync_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: integer("connectionId").notNull(),
  entityType: text("entityType", { enum: ["customers", "invoices", "payments", "accounts", "items", "company_info"] }).notNull(),
  status: text("status", { enum: ["success", "error", "partial"] }).notNull(),
  recordsSynced: integer("recordsSynced").default(0).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: integer("startedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  completedAt: integer("completedAt", { mode: "timestamp" }),
});

// ========== QBO CUSTOMERS (synced from QBO) ==========
export const qboCustomers = sqliteTable("qbo_customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: integer("connectionId").notNull(),
  qboCustomerId: text("qboCustomerId").notNull(),
  clientId: integer("clientId"),
  displayName: text("displayName"),
  companyName: text("companyName"),
  givenName: text("givenName"),
  familyName: text("familyName"),
  email: text("email"),
  phone: text("phone"),
  mobile: text("mobile"),
  fax: text("fax"),
  addressLine1: text("addressLine1"),
  addressLine2: text("addressLine2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postalCode"),
  country: text("country"),
  balance: real("balance").default(0),
  taxable: integer("taxable", { mode: "boolean" }).default(true),
  active: integer("active", { mode: "boolean" }).default(true),
  driveFolderUrl: text("driveFolderUrl"),
  quickLinks: text("quickLinks"),
  
  // Financial tracking (for practice health & client overview)
  monthlyFee: real("monthlyFee"),
  hourlyRate: real("hourlyRate"),
  billingType: text("billingType", { enum: ["monthly_fixed", "annual_fixed", "one_time_cleanup", "hourly", "project", "hybrid"] }),
  
  // Scorecard tracking (updated by AI or manual review)
  lastReconciledDate: integer("lastReconciledDate", { mode: "timestamp" }),
  booksHealthScore: integer("booksHealthScore").default(100),
  lastHstFiled: integer("lastHstFiled", { mode: "timestamp" }),
  lastPayrollRemitted: integer("lastPayrollRemitted", { mode: "timestamp" }),
  
  // US-specific fields
  isUsClient: integer("isUsClient", { mode: "boolean" }).default(false),
  usTaxId: text("usTaxId"),
  qboAccountType: text("qboAccountType", { enum: ["ca_clients", "us_clients"] }).default("ca_clients"),
  
  notes: text("notes"),
  lastUpdatedAt: integer("lastUpdatedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== QBO INVOICES (synced from QBO) ==========
export const qboInvoices = sqliteTable("qbo_invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: integer("connectionId").notNull(),
  qboInvoiceId: text("qboInvoiceId").notNull(),
  qboCustomerId: text("qboCustomerId"),
  clientId: integer("clientId"),
  invoiceNumber: text("invoiceNumber"),
  docNumber: text("docNumber"),
  transactionDate: integer("transactionDate", { mode: "timestamp" }),
  dueDate: integer("dueDate", { mode: "timestamp" }),
  totalAmount: real("totalAmount").default(0),
  balance: real("balance").default(0),
  status: text("status", { enum: ["draft", "sent", "paid", "overdue", "voided"] }).default("draft"),
  lineItems: text("lineItems"),
  memo: text("memo"),
  privateNote: text("privateNote"),
  lastUpdatedAt: integer("lastUpdatedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== QBO PAYMENTS ==========
export const qboPayments = sqliteTable("qbo_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: integer("connectionId").notNull(),
  qboPaymentId: text("qboPaymentId").notNull(),
  qboCustomerId: text("qboCustomerId"),
  clientId: integer("clientId"),
  totalAmount: real("totalAmount").default(0),
  unappliedAmount: real("unappliedAmount").default(0),
  paymentMethod: text("paymentMethod"),
  transactionDate: integer("transactionDate", { mode: "timestamp" }),
  status: text("status"),
  memo: text("memo"),
  lastUpdatedAt: integer("lastUpdatedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== QBO ACCOUNTS (Chart of Accounts) ==========
export const qboAccounts = sqliteTable("qbo_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: integer("connectionId").notNull(),
  qboAccountId: text("qboAccountId").notNull(),
  name: text("name"),
  accountType: text("accountType"),
  accountSubType: text("accountSubType"),
  classification: text("classification"),
  currentBalance: real("currentBalance").default(0),
  currencyRef: text("currencyRef"),
  active: integer("active", { mode: "boolean" }).default(true),
  lastUpdatedAt: integer("lastUpdatedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CLIENTS (Enhanced with workflow + onboarding) ==========
export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  address: text("address"),
  taxId: text("taxId"),
  status: text("status", { enum: ["active", "inactive", "prospect", "lead"] }).default("active").notNull(),
  
  // Workflow & Lead Tracking
  workflowStatus: text("workflowStatus", { enum: ["new_lead", "discovery_call", "quote_sent", "quote_approved", "engagement_sent", "onboarding_sent", "onboarding_complete", "active", "inactive", "churned"] }).default("new_lead").notNull(),
  leadSource: text("leadSource"),
  leadSourceDetail: text("leadSourceDetail"),
  discoveryDate: integer("discoveryDate", { mode: "timestamp" }),
  nextAction: text("nextAction"),
  nextActionDate: integer("nextActionDate", { mode: "timestamp" }),
  
  // Lead Scoring & Value
  estimatedMonthlyValue: real("estimatedMonthlyValue"),
  leadScore: integer("leadScore"),
  
  // Pain Points & Expectations
  painPoints: text("painPoints"),
  expectations: text("expectations"),
  serviceTier: text("serviceTier", { enum: ["basic", "standard", "premium", "enterprise"] }).default("standard"),
  monthlyFee: real("monthlyFee").default(0),
  
  // Onboarding
  onboardingSentAt: integer("onboardingSentAt", { mode: "timestamp" }),
  onboardingCompletedAt: integer("onboardingCompletedAt", { mode: "timestamp" }),
  onboardingToken: text("onboardingToken"),
  
  // Bookkeeping service flags
  hasHST: integer("hasHST", { mode: "boolean" }).default(false),
  hstNumber: text("hstNumber"),
  hstPeriod: text("hstPeriod", { enum: ["monthly", "quarterly", "annual"] }),
  hasWSIB: integer("hasWSIB", { mode: "boolean" }).default(false),
  wsibAccountNumber: text("wsibAccountNumber"),
  wsibQuarter: text("wsibQuarter", { enum: ["Q1", "Q2", "Q3", "Q4", "all"] }),
  hasPayroll: integer("hasPayroll", { mode: "boolean" }).default(false),
  payrollFrequency: text("payrollFrequency", { enum: ["weekly", "bi-weekly", "semi-monthly", "monthly", "self"] }),
  yearEndMonth: text("yearEndMonth", { enum: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] }),

  // Quote & Engagement Letter
  quoteAmount: real("quoteAmount"),
  quoteSentAt: integer("quoteSentAt", { mode: "timestamp" }),
  quoteApprovedAt: integer("quoteApprovedAt", { mode: "timestamp" }),
  transactionsPerMonth: integer("transactionsPerMonth").default(0),
  engagementSentAt: integer("engagementSentAt", { mode: "timestamp" }),
  engagementSignedAt: integer("engagementSignedAt", { mode: "timestamp" }),
  engagementLetterUrl: text("engagementLetterUrl"),

  assignedTo: text("assignedTo"),
  oneDriveFolderId: text("oneDriveFolderId"),
  qboCustomerId: text("qboCustomerId"),
  // Multi-QBO firm mapping: which QBO firm this client belongs to
  qboConnectionId: integer("qboConnectionId"),
  // Firm mapping columns
  industry: text("industry").default("other"),
  province: text("province").default("ON"),
  qboAccountType: text("qboAccountType").default("ca_clients"),
  figgyEmail: text("figgyEmail"),
  contactName: text("contactName"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CLIENT VAULT (Confidential Information) ==========
export const clientVault = sqliteTable("client_vault", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  
  // Bank Accounts
  bankName: text("bankName"),
  bankAccountNumber: text("bankAccountNumber"),
  bankRoutingNumber: text("bankRoutingNumber"),
  bankTransitNumber: text("bankTransitNumber"),
  bankBranch: text("bankBranch"),
  bankLogin: text("bankLogin"),
  bankPassword: text("bankPassword"),
  
  // Credit Cards
  creditCardNumber: text("creditCardNumber"),
  creditCardExpiry: text("creditCardExpiry"),
  creditCardCvv: text("creditCardCvv"),
  
  // Software Logins
  qboLogin: text("qboLogin"),
  qboPassword: text("qboPassword"),
  xeroLogin: text("xeroLogin"),
  xeroPassword: text("xeroPassword"),
  waveLogin: text("waveLogin"),
  wavePassword: text("wavePassword"),
  freshbooksLogin: text("freshbooksLogin"),
  freshbooksPassword: text("freshbooksPassword"),
  otherSoftwareLogins: text("otherSoftwareLogins"),
  
  // CRA / IRS
  craMyAccountLogin: text("craMyAccountLogin"),
  craMyAccountPassword: text("craMyAccountPassword"),
  craRepId: text("craRepId"),
  craAuthorizationDate: integer("craAuthorizationDate", { mode: "timestamp" }),
  irsLogin: text("irsLogin"),
  irsPassword: text("irsPassword"),
  irsCafNumber: text("irsCafNumber"),
  irsPowerOfAttorneyDate: integer("irsPowerOfAttorneyDate", { mode: "timestamp" }),
  
  // Notes
  vaultNotes: text("vaultNotes"),
  lastUpdatedBy: integer("lastUpdatedBy"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== GOVERNMENT REPRESENTATIVES ==========
export const clientGovReps = sqliteTable("client_gov_reps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  
  // CRA Representative
  craRepName: text("craRepName"),
  craRepNumber: text("craRepNumber"),
  craRepPhone: text("craRepPhone"),
  craRepEmail: text("craRepEmail"),
  craAuthorizationLevel: text("craAuthorizationLevel", { enum: ["level_1", "level_2", "level_3"] }).default("level_1"),
  craAuthorizationStart: integer("craAuthorizationStart", { mode: "timestamp" }),
  craAuthorizationEnd: integer("craAuthorizationEnd", { mode: "timestamp" }),
  
  // IRS Representative
  irsRepName: text("irsRepName"),
  irsRepPtin: text("irsRepPtin"),
  irsRepPhone: text("irsRepPhone"),
  irsRepEmail: text("irsRepEmail"),
  irsRepType: text("irsRepType", { enum: ["attorney", "cpa", "enrolled_agent", "other"] }),
  irsForm2848Date: integer("irsForm2848Date", { mode: "timestamp" }),
  irsForm8821Date: integer("irsForm8821Date", { mode: "timestamp" }),
  
  // State/Provincial
  stateTaxRepName: text("stateTaxRepName"),
  stateTaxRepPhone: text("stateTaxRepPhone"),
  stateTaxRepEmail: text("stateTaxRepEmail"),
  
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CLIENT ONBOARDING SUBMISSIONS ==========
export const clientOnboarding = sqliteTable("client_onboarding", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  token: text("token").notNull().unique(),
  
  // Business Info
  businessLegalName: text("businessLegalName"),
  businessOperatingName: text("businessOperatingName"),
  businessStructure: text("businessStructure", { enum: ["sole_proprietorship", "partnership", "corporation", "llc", "nonprofit", "other"] }),
  industry: text("industry"),
  incorporationDate: integer("incorporationDate", { mode: "timestamp" }),
  businessNumber: text("businessNumber"),
  ein: text("ein"),
  craBusinessNumber: text("craBusinessNumber"),
  hstGstNumber: text("hstGstNumber"),
  payrollAccountNumber: text("payrollAccountNumber"),
  wsibAccountNumber: text("wsibAccountNumber"),
  
  // Contact Info
  primaryContactName: text("primaryContactName"),
  primaryContactEmail: text("primaryContactEmail"),
  primaryContactPhone: text("primaryContactPhone"),
  secondaryContactName: text("secondaryContactName"),
  secondaryContactEmail: text("secondaryContactEmail"),
  
  // Banking
  bankName: text("bankName"),
  bankAccountNumber: text("bankAccountNumber"),
  bankRoutingNumber: text("bankRoutingNumber"),
  
  // Software
  currentAccountingSoftware: text("currentAccountingSoftware"),
  currentPayrollProvider: text("currentPayrollProvider"),
  
  // Services Needed
  servicesNeeded: text("servicesNeeded"),
  
  // Pain Points
  painPoints: text("painPoints"),
  expectations: text("expectations"),
  
  // Financial
  fiscalYearEnd: text("fiscalYearEnd"),
  lastFiledYear: text("lastFiledYear"),
  outstandingFilings: text("outstandingFilings"),
  
  // NEW: Business Profile for Task Automation
  hstGstFrequency: text("hstGstFrequency", { enum: ["monthly", "quarterly", "annually", "none"] }).default("none"),
  payrollFrequency: text("payrollFrequency", { enum: ["weekly", "biweekly", "semi_monthly", "monthly", "none"] }).default("none"),
  hasEmployees: integer("hasEmployees", { mode: "boolean" }).default(false),
  hasSubcontractors: integer("hasSubcontractors", { mode: "boolean" }).default(false),
  hasInvestments: integer("hasInvestments", { mode: "boolean" }).default(false),
  wsibRequired: integer("wsibRequired", { mode: "boolean" }).default(false),
  bankAccountCount: integer("bankAccountCount").default(1),
  creditCardCount: integer("creditCardCount").default(0),
  needsYearEnd: integer("needsYearEnd", { mode: "boolean" }).default(true),
  
  // NEW: Sales entry platforms
  usesStripe: integer("usesStripe", { mode: "boolean" }).default(false),
  usesSquare: integer("usesSquare", { mode: "boolean" }).default(false),
  usesJobber: integer("usesJobber", { mode: "boolean" }).default(false),
  salesEntryFrequency: text("salesEntryFrequency", { enum: ["daily", "weekly", "monthly", "none"] }).default("monthly"),
  
  // Status
  status: text("status", { enum: ["pending", "submitted", "reviewed", "approved"] }).default("pending").notNull(),
  submittedAt: integer("submittedAt", { mode: "timestamp" }),
  reviewedBy: integer("reviewedBy"),
  reviewedAt: integer("reviewedAt", { mode: "timestamp" }),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== WORKFLOW LOGS (Lead Journey Tracking) ==========
export const workflowLogs = sqliteTable("workflow_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  fromStatus: text("fromStatus"),
  toStatus: text("toStatus").notNull(),
  action: text("action").notNull(),
  notes: text("notes"),
  performedBy: integer("performedBy"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CLIENT TASK RULES (Auto-generated recurring tasks per client) ==========
export const clientTaskRules = sqliteTable("client_task_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  userId: integer("userId").notNull(),
  
  // Task definition
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  priority: text("priority", { enum: ["low", "medium", "high"] }).default("medium").notNull(),
  assignedTo: text("assignedTo"),
  
  // Recurrence
  ruleType: text("ruleType", { 
    enum: [
      "year_end",           // Annual year-end preparation
      "hst_monthly",        // Monthly HST/GST return
      "hst_quarterly",      // Quarterly HST/GST return
      "hst_annual",         // Annual HST/GST return
      "payroll_weekly",     // Weekly payroll remittance
      "payroll_biweekly",   // Bi-weekly payroll remittance
      "payroll_monthly",    // Monthly payroll remittance
      "t4_annual",          // Annual T4 filing (Feb)
      "t5_annual",          // Annual T5 filing (Feb)
      "t5018_annual",       // Annual T5018 filing (Feb)
      "wsib_annual",        // Annual WSIB reconciliation
      "bank_reconcile",     // Bank reconciliation
      "custom",             // Custom rule
    ] 
  }).notNull(),
  frequency: text("frequency", { enum: ["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"] }).notNull(),
  
  // Timing - day of month / month when task is due
  dueDayOfMonth: integer("dueDayOfMonth").default(15),      // e.g., 15th of month
  dueMonth: integer("dueMonth"),                             // e.g., 2 for February (T4s)
  daysBeforeDue: integer("daysBeforeDue").default(0),         // Days before deadline to create task
  
  // Fiscal year reference (for year-end tasks)
  fiscalYearEndMonth: integer("fiscalYearEndMonth"),          // e.g., 12 for December
  fiscalYearEndDay: integer("fiscalYearEndDay").default(31),  // e.g., 31
  
  // Active
  active: integer("active", { mode: "boolean" }).default(true).notNull(),
  
  // Next scheduled instance
  nextDueDate: integer("nextDueDate", { mode: "timestamp" }).notNull(),
  lastGeneratedDate: integer("lastGeneratedDate", { mode: "timestamp" }),
  
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
  completedAt: integer("completedAt", { mode: "timestamp" }),
  priority: text("priority", { enum: ["low", "medium", "high"] }).default("medium").notNull(),
  status: text("status", { enum: ["pending", "in_progress", "completed", "overdue"] }).default("pending").notNull(),
  category: text("category"),
  assignedTo: text("assignedTo"),
  
  // Recurring task tracking
  ruleId: integer("ruleId"),                              // Links to clientTaskRules
  isRecurring: integer("isRecurring", { mode: "boolean" }).default(false),
  recurrenceCount: integer("recurrenceCount").default(1),  // Which instance (1st, 2nd, etc.)
  
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

// ========== TIME ENTRIES (Per-client time tracking for profitability) ==========
export const timeEntries = sqliteTable("time_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  userId: integer("userId").notNull(),
  taskId: integer("taskId"), // optional link to a task
  
  // Time details
  date: integer("date", { mode: "timestamp" }).notNull(),
  description: text("description").notNull(),
  hours: real("hours").notNull(), // decimal hours (e.g., 1.5 for 1h 30m)
  
  // Billing
  isBillable: integer("isBillable", { mode: "boolean" }).default(true).notNull(),
  hourlyRate: real("hourlyRate"), // override rate for this entry
  
  // Category for reporting
  category: text("category", { enum: ["bookkeeping", "payroll", "tax_prep", "cleanup", "advisory", "admin", "other"] }).default("bookkeeping").notNull(),
  
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== EMAILS (Unified Inbox) ==========
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
  replyTo: text("replyTo"),
  toAddresses: text("toAddresses").notNull(),
  ccAddresses: text("ccAddresses"),
  subject: text("subject"),
  body: text("body"),
  bodyPlain: text("bodyPlain"),
  isRead: integer("isRead", { mode: "boolean" }).default(false).notNull(),
  isStarred: integer("isStarred", { mode: "boolean" }).default(false).notNull(),
  isImportant: integer("isImportant", { mode: "boolean" }).default(false).notNull(),
  isSent: integer("isSent", { mode: "boolean" }).default(false).notNull(),
  inReplyTo: integer("inReplyTo"),
  labels: text("labels"),
  attachments: text("attachments"),
  receivedAt: integer("receivedAt", { mode: "timestamp" }).notNull(),
  sentAt: integer("sentAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CLIENT PORTAL TOKENS ==========
export const portalTokens = sqliteTable("portal_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  token: text("token").notNull().unique(),
  email: text("email").notNull(),
  isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }),
  lastUsedAt: integer("lastUsedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CLIENT PORTAL SETTINGS (what the bookkeeper configures) ==========
export const portalSettings = sqliteTable("portal_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull().unique(),
  // Visibility toggles
  showFinancialOverview: integer("showFinancialOverview", { mode: "boolean" }).default(true).notNull(),
  showTasks: integer("showTasks", { mode: "boolean" }).default(true).notNull(),
  showDocuments: integer("showDocuments", { mode: "boolean" }).default(true).notNull(),
  showInvoices: integer("showInvoices", { mode: "boolean" }).default(true).notNull(),
  showTaxDeadlines: integer("showTaxDeadlines", { mode: "boolean" }).default(false).notNull(),
  // Welcome message
  welcomeMessage: text("welcomeMessage"),
  // Portal enabled
  isEnabled: integer("isEnabled", { mode: "boolean" }).default(false).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CLIENT MISSING ITEMS (requests from bookkeeper to client) ==========
export const missingItems = sqliteTable("missing_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  userId: integer("userId").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category", { enum: ["bank_statement", "receipt", "invoice", "tax_form", "payroll_doc", "other"] }).default("other").notNull(),
  dueDate: integer("dueDate", { mode: "timestamp" }),
  // Status
  status: text("status", { enum: ["pending", "submitted", "approved", "overdue"] }).default("pending").notNull(),
  // File reference when client uploads
  uploadedFileId: integer("uploadedFileId"),
  submittedAt: integer("submittedAt", { mode: "timestamp" }),
  reviewedAt: integer("reviewedAt", { mode: "timestamp" }),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CLIENT EMAILS (Multiple emails per client) ==========
export const clientEmails = sqliteTable("client_emails", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  email: text("email").notNull(),
  label: text("label", { enum: ["primary", "billing", "payroll", "general", "other"] }).default("general").notNull(),
  isDefault: integer("isDefault", { mode: "boolean" }).default(false).notNull(),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== FILES (Unified Storage) ==========
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

// ========== CALENDAR EVENTS (Unified Calendar) ==========
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
  meetingLink: text("meeting_link"),
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
  qboInvoiceId: text("qboInvoiceId"),
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
  type: text("type", { enum: ["task_due", "task_overdue", "invoice_overdue", "email_received", "calendar_event", "client_activity", "ai_agent_alert", "qbo_sync", "system"] }).notNull(),
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
  notifyQBO: integer("notifyQBO", { mode: "boolean" }).default(true).notNull(),
  dashboardWidgets: text("dashboardWidgets").default('["stats","tasks","emails","calendar","qbo"]'),
  defaultView: text("defaultView", { enum: ["dashboard", "clients", "tasks", "emails", "calendar", "files", "invoices"] }).default("dashboard"),
  theme: text("theme", { enum: ["light", "dark", "system"] }).default("system"),
  timezone: text("timezone").default("UTC"),
  dateFormat: text("dateFormat").default("MMM d, yyyy"),
  currency: text("currency").default("USD"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CLIENT DASHBOARD SNAPSHOTS (P&L, Balance Sheet from QBO) ==========
export const clientDashboardSnapshots = sqliteTable("client_dashboard_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  userId: integer("userId").notNull(),
  
  // P&L Summary
  revenue: real("revenue").default(0),
  expenses: real("expenses").default(0),
  netIncome: real("netIncome").default(0),
  
  // Balance Sheet Summary
  assets: real("assets").default(0),
  liabilities: real("liabilities").default(0),
  equity: real("equity").default(0),
  
  // Reporting period
  periodStart: integer("periodStart", { mode: "timestamp" }),
  periodEnd: integer("periodEnd", { mode: "timestamp" }),
  
  // Source
  source: text("source", { enum: ["qbo", "manual", "import"] }).default("manual"),
  
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== PAYROLL TIMESHEETS ==========
export const timesheets = sqliteTable("timesheets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  employeeId: integer("employeeId").notNull(),
  
  // Pay period
  payPeriodStart: integer("payPeriodStart", { mode: "timestamp" }).notNull(),
  payPeriodEnd: integer("payPeriodEnd", { mode: "timestamp" }).notNull(),
  
  // Hours
  regularHours: real("regularHours").default(0),
  overtimeHours: real("overtimeHours").default(0),
  vacationHours: real("vacationHours").default(0),
  sickHours: real("sickHours").default(0),
  statHolidayHours: real("statHolidayHours").default(0),
  
  // Pay rates at time of timesheet
  hourlyRate: real("hourlyRate"),
  overtimeRate: real("overtimeRate"),
  
  // Status
  status: text("status", { enum: ["draft", "submitted", "approved", "paid"] }).default("draft").notNull(),
  approvedBy: integer("approvedBy"),
  approvedAt: integer("approvedAt", { mode: "timestamp" }),
  
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  firstName: text("firstName").notNull(),
  lastName: text("lastName").notNull(),
  sin: text("sin"),
  dateOfBirth: integer("dateOfBirth", { mode: "timestamp" }),
  hireDate: integer("hireDate", { mode: "timestamp" }),
  startDate: integer("startDate", { mode: "timestamp" }),
  payType: text("payType", { enum: ["salary", "hourly", "commission", "contract"] }).default("salary"),
  annualSalary: real("annualSalary"),
  hourlyRate: real("hourlyRate"),
  hoursPerWeek: real("hoursPerWeek").default(40),
  position: text("position"),
  department: text("department"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  isContractor: integer("isContractor", { mode: "boolean" }).default(false),
  isActive: integer("isActive", { mode: "boolean" }).default(true),
  terminationDate: integer("terminationDate", { mode: "timestamp" }),
  terminationReason: text("terminationReason"),
  // Benefits
  hasHealthBenefits: integer("hasHealthBenefits", { mode: "boolean" }).default(false),
  hasDentalBenefits: integer("hasDentalBenefits", { mode: "boolean" }).default(false),
  hasRrsp: integer("hasRrsp", { mode: "boolean" }).default(false),
  rrspMatchPercent: real("rrspMatchPercent"),
  // Government programs
  onGovernmentGrant: integer("onGovernmentGrant", { mode: "boolean" }).default(false),
  grantType: text("grantType"),
  grantStartDate: integer("grantStartDate", { mode: "timestamp" }),
  grantEndDate: integer("grantEndDate", { mode: "timestamp" }),
  // Tax
  federalTaxCredits: text("federalTaxCredits"),
  provincialTaxCredits: text("provincialTaxCredits"),
  t4Box14Wages: real("t4Box14Wages"),
  t4Box16Cpp: real("t4Box16Cpp"),
  t4Box18Ei: real("t4Box18Ei"),
  t4Box20Rpp: real("t4Box20Rpp"),
  t4Box44UnionDues: real("t4Box44UnionDues"),
  t4Box46Charitable: real("t4Box46Charitable"),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== TRIAGE FINDINGS (AI Agent findings for human review) ==========
export const triageFindings = sqliteTable("triage_findings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentName: text("agentName").notNull(),
  agentVersion: text("agentVersion"),
  clientId: integer("clientId"),
  findingType: text("findingType", { enum: ["reconciliation", "missing_docs", "deadline", "anomaly", "review", "compliance"] }).notNull(),
  severity: text("severity", { enum: ["critical", "warning", "info"] }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  suggestedAction: text("suggestedAction"),
  sourceData: text("sourceData"), // JSON blob
  confidence: real("confidence"),
  status: text("status", { enum: ["new", "approved", "dismissed"] }).default("new").notNull(),
  reviewedBy: integer("reviewedBy"),
  reviewedAt: integer("reviewedAt", { mode: "timestamp" }),
  reviewedNotes: text("reviewedNotes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== SATISFACTION SCORES ==========
export const satisfactionScores = sqliteTable("satisfaction_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  userId: integer("userId").notNull(),
  score: integer("score").notNull(),
  notes: text("notes"),
  callType: text("callType").default("check_in"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== MONTHLY CLOSE CHECKLIST (Interactive per-client per-month) ==========
export const monthlyCloseChecklist = sqliteTable("monthly_close_checklist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  userId: integer("userId").notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  
  bankStatementsReconciled: integer("bankStatementsReconciled", { mode: "boolean" }).default(false).notNull(),
  creditCardStatementsReconciled: integer("creditCardStatementsReconciled", { mode: "boolean" }).default(false).notNull(),
  allReceiptsProcessed: integer("allReceiptsProcessed", { mode: "boolean" }).default(false).notNull(),
  apReviewed: integer("apReviewed", { mode: "boolean" }).default(false).notNull(),
  arReviewed: integer("arReviewed", { mode: "boolean" }).default(false).notNull(),
  payrollJournalVerified: integer("payrollJournalVerified", { mode: "boolean" }).default(false).notNull(),
  sourceDeductionsConfirmed: integer("sourceDeductionsConfirmed", { mode: "boolean" }).default(false).notNull(),
  hstGstTracked: integer("hstGstTracked", { mode: "boolean" }).default(false).notNull(),
  ownerTransactionsSeparated: integer("ownerTransactionsSeparated", { mode: "boolean" }).default(false).notNull(),
  adjustingEntriesPosted: integer("adjustingEntriesPosted", { mode: "boolean" }).default(false).notNull(),
  plReviewed: integer("plReviewed", { mode: "boolean" }).default(false).notNull(),
  balanceSheetReviewed: integer("balanceSheetReviewed", { mode: "boolean" }).default(false).notNull(),
  bankRecMatchesBalanceSheet: integer("bankRecMatchesBalanceSheet", { mode: "boolean" }).default(false).notNull(),
  financialsUploaded: integer("financialsUploaded", { mode: "boolean" }).default(false).notNull(),
  clientNotified: integer("clientNotified", { mode: "boolean" }).default(false).notNull(),
  sourceDocsFiled: integer("sourceDocsFiled", { mode: "boolean" }).default(false).notNull(),
  
  notes: text("notes"),
  completedAt: integer("completedAt", { mode: "timestamp" }),
  completionPercent: integer("completionPercent").default(0).notNull(),
  
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== PORTAL FILES (Files shared with clients via portal) ==========
export const portalFiles = sqliteTable("portal_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  userId: integer("userId").notNull(),
  // File reference (can be Google Drive link or local file)
  name: text("name").notNull(),
  description: text("description"),
  provider: text("provider", { enum: ["google_drive", "one_drive", "local", "link"] }).notNull(),
  providerFileId: text("providerFileId"),
  webViewLink: text("webViewLink"),
  downloadLink: text("downloadLink"),
  mimeType: text("mimeType"),
  size: integer("size"),
  // Visibility
  category: text("category", { enum: ["financial_statement", "report", "tax_document", "receipt", "general", "engagement_letter"] }).default("general").notNull(),
  periodStart: integer("periodStart", { mode: "timestamp" }),
  periodEnd: integer("periodEnd", { mode: "timestamp" }),
  // Status
  isVisible: integer("isVisible", { mode: "boolean" }).default(true).notNull(),
  // Timestamps
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== SIGNATURE DOCUMENTS (Any doc requiring client signature) ==========
export const signatureDocuments = sqliteTable("signature_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  userId: integer("userId").notNull(),
  // Document details
  title: text("title").notNull(),
  description: text("description"),
  content: text("content").notNull(), // HTML/markdown content of the document
  documentType: text("documentType", { enum: ["engagement_letter", "tax_authorization", "poa", "consent", "nda", "custom"] }).default("custom").notNull(),
  // Status workflow: draft → sent → viewed → signed | expired | cancelled
  status: text("status", { enum: ["draft", "sent", "viewed", "signed", "expired", "cancelled"] }).default("draft").notNull(),
  // Signature capture
  signedBy: text("signedBy"),
  signedByEmail: text("signedByEmail"),
  signatureType: text("signatureType", { enum: ["type_name", "draw", "click"] }).default("type_name"),
  signatureData: text("signatureData"), // JSON with signature image/name/timestamp
  signedAt: integer("signedAt", { mode: "timestamp" }),
  ipAddress: text("ipAddress"),
  // Portal sharing
  portalToken: text("portalToken"), // Link to portal for client to sign
  expiresAt: integer("expiresAt", { mode: "timestamp" }),
  // Sending
  sentAt: integer("sentAt", { mode: "timestamp" }),
  viewedAt: integer("viewedAt", { mode: "timestamp" }),
  sentBy: integer("sentBy"),
  // Audit
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CLIENT PLAYBOOKS (Per-client SOP) ==========
export const clientPlaybooks = sqliteTable("client_playbooks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull().unique(),
  userId: integer("userId").notNull(),
  // Auto-generated flag
  autoGenerated: integer("autoGenerated", { mode: "boolean" }).default(false).notNull(),
  // Sections stored as JSON
  sections: text("sections"), // JSON array of playbook sections
  // Timestamps
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== ENGAGEMENT LETTERS ==========
export const engagementLetters = sqliteTable("engagement_letters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  templateName: text("templateName").default("standard"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  status: text("status", { enum: ["draft", "sent", "viewed", "signed", "expired", "cancelled"] }).default("draft").notNull(),
  sentAt: integer("sentAt", { mode: "timestamp" }),
  viewedAt: integer("viewedAt", { mode: "timestamp" }),
  signedAt: integer("signedAt", { mode: "timestamp" }),
  signedBy: text("signedBy"),
  sentBy: integer("sentBy"),
  // Fee structure
  monthlyFee: real("monthlyFee"),
  hourlyRate: real("hourlyRate"),
  retainerAmount: real("retainerAmount"),
  // Services
  servicesIncluded: text("servicesIncluded"),
  servicesExcluded: text("servicesExcluded"),
  // Term
  termStart: integer("termStart", { mode: "timestamp" }),
  termEnd: integer("termEnd", { mode: "timestamp" }),
  autoRenew: integer("autoRenew", { mode: "boolean" }).default(true),
  renewalNoticeDays: integer("renewalNoticeDays").default(30),
  // Legal
  jurisdiction: text("jurisdiction").default("Ontario, Canada"),
  governingLaw: text("governingLaw").default("Laws of the Province of Ontario and the federal laws of Canada"),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== EMAIL SENDER RULES (Which "from" address to use per client) ==========
export const senderRules = sqliteTable("sender_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId"),                    // NULL = default rule for all clients
  fromAddress: text("fromAddress").notNull(),       // e.g. finance@adbank.network
  fromName: text("fromName").notNull(),             // e.g. "Go Fig Bookz — Finance"
  replyTo: text("replyTo"),                          // Optional different reply-to
  isDefault: integer("isDefault", { mode: "boolean" }).default(false).notNull(),
  // Matching logic
  clientEmailDomain: text("clientEmailDomain"),     // Match by domain (e.g. "darkhorseinc.com")
  clientNamePattern: text("clientNamePattern"),     // Match by name contains (e.g. "Dark Horse")
  priority: integer("priority").default(0).notNull(), // Higher = evaluated first
  notes: text("notes"),
  isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});