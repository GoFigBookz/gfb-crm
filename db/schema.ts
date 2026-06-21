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

// ========== CONNECTED ACCOUNTS (Multi-account OAuth + API Key Connectors) ==========
export const connectedAccounts = sqliteTable("connected_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  clientId: integer("clientId"),                          // NULL = firm-wide (e.g. your Gmail), SET = per-client connector
  provider: text("provider", { enum: [
    "google", "microsoft", "dropbox", "icloud",
    "quickbooks",
    "wise", "stripe", "jobber", "touchbistro", "paypal",
  ]}).notNull(),
  providerAccountId: text("providerAccountId"),            // OAuth account ID (null for API key connectors)
  accountLabel: text("accountLabel").default("Primary").notNull(),
  accountEmail: text("accountEmail"),                      // For OAuth: email. For API key: key identifier / public key
  accessToken: text("accessToken"),                        // OAuth: token. API key: encrypted secret key
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
  // Transport: "native" = our OAuth tokens (accessToken/refreshToken above);
  // "make_bridge" = proxy QBO calls through a Make per-realm webhook (Make holds
  // the tokens). Lets the brain run live before native OAuth is finished.
  transport: text("transport", { enum: ["native", "make_bridge"] }).default("native").notNull(),
  bridgeUrl: text("bridgeUrl"),       // Make scenario-run endpoint for this realm's QBO tool (make_bridge only)
  bridgeSecret: text("bridgeSecret"), // per-conn Make API token override (else env FIGGY_MAKE_API_TOKEN)
  // Multi-account support: personal_business, ca_clients, us_clients
  accountType: text("accountType", { enum: ["personal_business", "ca_clients", "us_clients"] }).default("ca_clients").notNull(),
  // Which CRM client this QBO company belongs to (NULL = unassigned/triage)
  clientId: integer("clientId"),
  isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
  // Set when a native token refresh fails (e.g. invalid_grant) — surfaces a
  // one-click reconnect in the UI; the brain treats inactive as not-connected.
  reconnectReason: text("reconnectReason"),
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
  // Triage / review workflow
  reviewStatus: text("reviewStatus", { enum: ["pending", "approved", "rejected", "posted"] }).default("pending"),
  reviewedBy: integer("reviewedBy"),
  reviewedAt: integer("reviewedAt", { mode: "timestamp" }),
  reviewNotes: text("reviewNotes"),
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
  // Triage / review workflow
  reviewStatus: text("reviewStatus", { enum: ["pending", "approved", "rejected", "posted"] }).default("pending"),
  reviewedBy: integer("reviewedBy"),
  reviewedAt: integer("reviewedAt", { mode: "timestamp" }),
  reviewNotes: text("reviewNotes"),
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

// ========== VENDOR MEMORY (Figgy Jr Account-Selection Brain cache) ==========
// Learned vendor -> preferred account/tax, derived from live QBO vendor history
// and re-validated each run. QBO's Vendor entity has no native account/tax
// field, so the coding brain's memory lives here (contact fields write back to
// the QBO vendor card; coding stays in this cache).
export const vendorMemory = sqliteTable("vendor_memory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: integer("connectionId").notNull(),
  clientId: integer("clientId"),
  qboVendorId: text("qboVendorId").notNull(),
  vendorName: text("vendorName"),
  preferredAccountId: text("preferredAccountId"),
  preferredAccountName: text("preferredAccountName"),
  preferredTaxCode: text("preferredTaxCode"),
  sampleCount: integer("sampleCount").default(0),
  // Human-confirmed coding (Markie approved a card for this vendor). A confirmed
  // rule WINS over history-derived coding and is never overwritten by it.
  confirmedByHuman: integer("confirmedByHuman", { mode: "boolean" }).default(false),
  confirmedAt: integer("confirmedAt", { mode: "timestamp" }),
  lastValidatedAt: integer("lastValidatedAt", { mode: "timestamp" }),
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
  website: text("website"),          // used to auto-fetch the client's logo on cards
  address: text("address"),
  taxId: text("taxId"),
  status: text("status", { enum: ["active", "inactive", "prospect", "lead"] }).default("active").notNull(),
  // Service type — drives task generation AND month-end-board relevance.
  //  monthly  = full-service bookkeeping (default; on the board every month)
  //  quarterly= surfaces in post-quarter months (Jan/Apr/Jul/Oct)
  //  annual   = surfaces within ~3 months after fiscal year-end
  //  payroll  = payroll-focused (always on the board)
  //  wholesale= flow-through (we just resell QBO): NO tasks/close/quote, off the board
  clientType: text("clientType", { enum: ["monthly", "quarterly", "annual", "payroll", "wholesale"] }).default("monthly"),

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
  // Client-level PAYROLL FEATURES — which pay components this client's payroll
  // actually has. Drives what the pay run shows/creates (client-specific) so we
  // never surface bonuses/dividends/etc. for a client that doesn't use them.
  payrollBonuses: integer("payrollBonuses", { mode: "boolean" }).default(false),
  payrollDividends: integer("payrollDividends", { mode: "boolean" }).default(false),
  payrollPhoneAllowance: integer("payrollPhoneAllowance", { mode: "boolean" }).default(false),
  payrollReimbursements: integer("payrollReimbursements", { mode: "boolean" }).default(false),
  payrollRevenueShare: integer("payrollRevenueShare", { mode: "boolean" }).default(false),
  payrollCraComparison: integer("payrollCraComparison", { mode: "boolean" }).default(false),
  payrollFrequency: text("payrollFrequency", { enum: ["weekly", "bi-weekly", "semi-monthly", "monthly", "self"] }),
  // CRA source-deduction remitter type — drives the PD7A remittance due date.
  payrollRemitterFreq: text("payrollRemitterFreq", { enum: ["regular", "quarterly", "accelerated"] }).default("regular"),
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
  // Master-intake reference (imported from MASTER_INTAKE_DATABASE sheet)
  payrollRpNumber: text("payrollRpNumber"),
  driveFolderUrl: text("driveFolderUrl"),
  clientInfoDocUrl: text("clientInfoDocUrl"),
  nextPayday: text("nextPayday"),
  qboCustomerId: text("qboCustomerId"),
  // Multi-QBO firm mapping: which QBO firm this client belongs to
  qboConnectionId: integer("qboConnectionId"),
  // Firm mapping columns
  industry: text("industry").default("other"),
  province: text("province").default("ON"),
  qboAccountType: text("qboAccountType").default("ca_clients"),
  figgyEmail: text("figgyEmail"),
  contactName: text("contactName"),
  // CRA Represent a Client (RAC) authorization status
  craRacDone: integer("craRacDone", { mode: "boolean" }).default(false),
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
  usesTouchBistro: integer("usesTouchBistro", { mode: "boolean" }).default(false),
  usesPayPal: integer("usesPayPal", { mode: "boolean" }).default(false),
  salesEntryFrequency: text("salesEntryFrequency", { enum: ["daily", "weekly", "monthly", "none"] }).default("monthly"),

  // NEW: scope / responsibilities (factor into pricing)
  paysDividends: integer("paysDividends", { mode: "boolean" }).default(false),
  hasEHT: integer("hasEHT", { mode: "boolean" }).default(false),
  employeeCount: integer("employeeCount").default(0),
  monthsBehind: integer("monthsBehind").default(0),
  bookkeepingFrequency: text("bookkeepingFrequency", { enum: ["monthly", "quarterly", "annual", "none"] }).default("monthly"),
  usesHubdoc: integer("usesHubdoc", { mode: "boolean" }).default(false),
  hasJobCosting: integer("hasJobCosting", { mode: "boolean" }).default(false),
  avgMonthlyTransactions: integer("avgMonthlyTransactions").default(0),
  invoicingResponsibility: text("invoicingResponsibility", { enum: ["we_invoice", "client_invoices", "none"] }).default("none"),
  billPayResponsibility: text("billPayResponsibility", { enum: ["we_pay", "client_pays", "none"] }).default("none"),
  // QuickBooks subscription billed wholesale through GFB (pass-through on quote)
  qboSoftwareTier: text("qboSoftwareTier", { enum: ["none", "easystart", "essentials", "plus"] }).default("none"),
  qboSoftwareWholesale: integer("qboSoftwareWholesale", { mode: "boolean" }).default(false),
  qboPayrollWholesale: integer("qboPayrollWholesale", { mode: "boolean" }).default(false),

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
  // Workflow board stage (Financial Cents-style kanban)
  stage: text("stage", { enum: ["todo", "in_progress", "review", "done"] }).default("todo"),
  category: text("category"),
  assignedTo: text("assignedTo"),
  
  // Recurring task tracking
  ruleId: integer("ruleId"),                              // Links to clientTaskRules
  isRecurring: integer("isRecurring", { mode: "boolean" }).default(false),
  recurrenceCount: integer("recurrenceCount").default(1),  // Which instance (1st, 2nd, etc.)
  
  googleCalendarEventId: text("googleCalendarEventId"),
  googleTaskId: text("googleTaskId"),
  outlookTaskId: text("outlookTaskId"),
  microsoftTaskId: text("microsoftTaskId"),
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
  agentType: text("agentType", { enum: ["bookkeeper", "controller", "cfo", "social_media_manager", "executive_assistant", "sales_assistant", "customer_support", "custom"] }).notNull(),
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
  contractUrl: text("contractUrl"),
  // Recurring per-pay add-ons (per-employee, editable on the card).
  phoneAllowance: real("phoneAllowance"),         // $ per pay period, if any
  reimbursementAmount: real("reimbursementAmount"), // $ per pay period, if any
  reimbursementNote: text("reimbursementNote"),     // what the reimbursement is for
  // Per-employee PAYROLL FEATURE applicability — which of the client's enabled
  // features actually apply to THIS person (e.g. only 2 staff get revenue share).
  getsRevenueShare: integer("getsRevenueShare", { mode: "boolean" }).default(false),
  revenueSharePercent: real("revenueSharePercent"), // % of the revenue-share base
  // Opening YTD gross carryforward for the CURRENT calendar year (e.g. seeded
  // from a client's prior-system payroll sheet) — feeds CPP/EI maxing so the
  // CRA-grade calc is correct from the first run in the CRM.
  ytdGrossOpening: real("ytdGrossOpening"),
  getsBonus: integer("getsBonus", { mode: "boolean" }).default(false),
  getsDividends: integer("getsDividends", { mode: "boolean" }).default(false),
  getsPhoneAllowance: integer("getsPhoneAllowance", { mode: "boolean" }).default(false),
  getsReimbursement: integer("getsReimbursement", { mode: "boolean" }).default(false),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== PAYROLL: PAY RUNS (the "one clean sheet" per client per period) ==========
// A pay run groups one line per employee for a single pay period. Keyed to
// clients.id (tenant boundary). hoursSource records provenance (manual entry vs
// Clockify/Jobber/TouchBistro import vs QBO autopay like West York).
export const payRuns = sqliteTable("pay_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  payPeriodStart: integer("payPeriodStart", { mode: "timestamp" }).notNull(),
  payPeriodEnd: integer("payPeriodEnd", { mode: "timestamp" }).notNull(),
  payDate: integer("payDate", { mode: "timestamp" }),
  frequency: text("frequency", { enum: ["weekly", "biweekly", "semi_monthly", "monthly"] }).default("monthly"),
  runType: text("runType", { enum: ["regular", "off_cycle", "bonus"] }).default("regular").notNull(),
  status: text("status", { enum: ["draft", "review", "approved", "paid", "posted"] }).default("draft").notNull(),
  hoursSource: text("hoursSource", { enum: ["manual", "clockify", "jobber", "touchbistro", "qbo_autopay"] }).default("manual").notNull(),
  totalGross: real("totalGross").default(0),
  totalNet: real("totalNet").default(0),
  totalEmployeeDeductions: real("totalEmployeeDeductions").default(0),
  totalEmployerCost: real("totalEmployerCost").default(0),
  // Client hours-approval flow
  approvalToken: text("approvalToken"),
  approvalStatus: text("approvalStatus", { enum: ["none", "sent", "approved", "changes_requested"] }).default("none"),
  approvedByName: text("approvedByName"),
  approvedAt: integer("approvedAt", { mode: "timestamp" }),
  approvalNote: text("approvalNote"),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// One line per employee per pay run (the paystub row in the clean sheet).
export const payRunLines = sqliteTable("pay_run_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  payRunId: integer("payRunId").notNull(),
  employeeId: integer("employeeId").notNull(),
  // Hours (for hourly employees / imported time)
  regularHours: real("regularHours").default(0),
  overtimeHours: real("overtimeHours").default(0),
  vacationHours: real("vacationHours").default(0),
  statHolidayHours: real("statHolidayHours").default(0),
  sickHours: real("sickHours").default(0),
  // Earnings (mirrors the client sheet columns)
  grossPay: real("grossPay").default(0),
  shareBonus: real("shareBonus").default(0),
  statHolidayPay: real("statHolidayPay").default(0),
  // Non-taxable take-home add-ons (paid on top of net), shown only when the
  // client has the feature enabled.
  phoneAllowance: real("phoneAllowance").default(0),
  reimbursement: real("reimbursement").default(0),
  vacationPayAccrued: real("vacationPayAccrued").default(0),
  vacationPayPaid: real("vacationPayPaid").default(0),
  // Employee deductions
  cppEmployee: real("cppEmployee").default(0),
  cpp2Employee: real("cpp2Employee").default(0),
  eiEmployee: real("eiEmployee").default(0),
  federalTax: real("federalTax").default(0),
  provincialTax: real("provincialTax").default(0),
  otherDeductions: real("otherDeductions").default(0),
  // Employer cost
  cppEmployer: real("cppEmployer").default(0),
  cpp2Employer: real("cpp2Employer").default(0),
  eiEmployer: real("eiEmployer").default(0),
  // Net
  netPay: real("netPay").default(0),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== SMS MESSAGES (texting clients via an Android SMS gateway) ==========
// Inbound texts are POSTed to /api/sms/inbound by the gateway app on Markie's
// phone; outbound texts are sent back through the gateway's API. Threads are
// grouped by counterparty phone; auto-linked to a client by matching phone.
export const smsMessages = sqliteTable("sms_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId"),                // matched by phone, nullable
  direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
  counterparty: text("counterparty").notNull(), // the client's phone (normalized digits)
  body: text("body").notNull(),
  status: text("status", { enum: ["received", "queued", "sent", "failed"] }).default("received").notNull(),
  externalId: text("externalId"),               // gateway message id
  read: integer("read", { mode: "boolean" }).default(false),
  sentBy: integer("sentBy"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CLIENT REQUESTS (Karbon-style document/info request checklists) ==========
// A named, magic-link checklist of things you need FROM a client (documents,
// answers). The client opens the token URL, ticks items off / leaves notes, and
// you see outstanding vs provided. Reuses the portal token pattern.
export const clientRequests = sqliteTable("client_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  title: text("title").notNull(),
  message: text("message"),                 // optional intro shown to the client
  token: text("token").notNull(),
  status: text("status", { enum: ["open", "completed", "cancelled"] }).default("open").notNull(),
  dueDate: integer("dueDate", { mode: "timestamp" }),
  reminderCount: integer("reminderCount").default(0),
  lastReminderAt: integer("lastReminderAt", { mode: "timestamp" }),
  createdBy: integer("createdBy"),
  completedAt: integer("completedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const clientRequestItems = sqliteTable("client_request_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: integer("requestId").notNull(),
  label: text("label").notNull(),
  status: text("status", { enum: ["pending", "provided"] }).default("pending").notNull(),
  response: text("response"),               // client's note / link
  providedAt: integer("providedAt", { mode: "timestamp" }),
  sortOrder: integer("sortOrder").default(0),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
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
  status: text("status", { enum: ["new", "approved", "dismissed", "awaiting_client"] }).default("new").notNull(),
  reviewedBy: integer("reviewedBy"),
  reviewedAt: integer("reviewedAt", { mode: "timestamp" }),
  reviewedNotes: text("reviewedNotes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== MASTER TRIAGE QUEUE (One inbox for ALL incoming documents) ==========
export const triageQueue = sqliteTable("triage_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  
  // Source info
  sourceType: text("sourceType", { enum: ["email", "portal_upload", "hubdoc", "stripe_webhook", "bank_feed", "manual", "qbo_sync", "wise_sync", "jobber_sync", "touchbistro_sync", "paypal_sync"] }).notNull(),
  sourceId: text("sourceId"),              // email ID, upload ID, webhook ID, etc.
  sourceEmail: text("sourceEmail"),        // for email-based items
  sourceUrl: text("sourceUrl"),            // link to original if applicable
  
  // Document info (AI-extracted or provided)
  documentType: text("documentType", { enum: ["receipt", "invoice", "bank_statement", "credit_card_statement", "payroll_doc", "tax_form", "contract", "other"] }).default("receipt").notNull(),
  vendorName: text("vendorName"),
  vendorId: integer("vendorId"),           // linked to vendors table once known
  invoiceNumber: text("invoiceNumber"),
  description: text("description"),
  amount: real("amount"),
  hstAmount: real("hstAmount"),
  totalAmount: real("totalAmount"),
  currency: text("currency").default("CAD"),
  transactionDate: integer("transactionDate", { mode: "timestamp" }),
  dueDate: integer("dueDate", { mode: "timestamp" }),
  
  // QBO account suggestions
  suggestedAccount: text("suggestedAccount"),
  suggestedAccountId: text("suggestedAccountId"),    // QBO account ref
  suggestedHstCode: text("suggestedHstCode"),
  suggestedHstCodeId: text("suggestedHstCodeId"),      // QBO tax code ref
  
  // Client assignment (NULL = unassigned, needs your input)
  suggestedClientId: integer("suggestedClientId"),     // AI guess
  assignedClientId: integer("assignedClientId"),       // your final assignment
  confidenceScore: integer("confidenceScore"),        // 0-100
  
  // File storage
  fileUrl: text("fileUrl"),                // Google Drive temp URL
  fileName: text("fileName"),
  mimeType: text("mimeType"),
  driveFileId: text("driveFileId"),        // once filed to client folder
  
  // QBO posting
  qboConnectionId: integer("qboConnectionId"),         // which QBO realm
  qboBillId: text("qboBillId"),             // once posted
  qboInvoiceId: text("qboInvoiceId"),       // if it's a customer invoice
  qboPaymentId: text("qboPaymentId"),       // if it's a payment
  
  // Status workflow
  status: text("status", { enum: ["pending", "needs_client", "needs_vendor", "ready_to_approve", "approved", "posted", "rejected", "saved", "duplicate"] }).default("pending").notNull(),
  actionTaken: text("actionTaken", { enum: ["none", "posted_to_qbo", "filed_to_drive", "rejected_duplicate", "rejected_not_business", "rejected_wrong_client", "saved_for_later", "assigned_to_client", "bank_matched"] }).default("none"),
  
  // AI reasoning
  aiSuggestion: text("aiSuggestion"),        // full AI reasoning text
  aiFlags: text("aiFlags"),                // JSON: ["duplicate_possible", "multi_client_vendor", "personal_possible"]
  
  // Human review
  reviewedBy: integer("reviewedBy"),
  reviewedAt: integer("reviewedAt", { mode: "timestamp" }),
  reviewerNotes: text("reviewerNotes"),
  
  // Timestamps
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  postedAt: integer("postedAt", { mode: "timestamp" }),
  staleNotifiedAt: integer("staleNotifiedAt", { mode: "timestamp" }),  // when flagged as >3 days old
});

// Indexes for triage queue performance
// (Drizzle doesn't have index() in sqliteTable; add via manual SQL in migrations)

// ========== MAKE.COM FORM SUBMISSIONS ==========
export const makeSubmissions = sqliteTable("make_submissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").default("make.com").notNull(),
  payload: text("payload").notNull(),           // raw JSON from Make.com
  status: text("status", { enum: ["new", "reviewed", "approved", "rejected", "posted"] }).default("new").notNull(),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
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

// ========== PER-CLIENT CONNECTOR STATEMENTS (Wise, Stripe, Jobber, TouchBistro, PayPal) ==========
export const connectorStatements = sqliteTable("connector_statements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  userId: integer("userId").notNull(),
  connectedAccountId: integer("connectedAccountId").notNull(),
  provider: text("provider", { enum: ["wise", "stripe", "jobber", "touchbistro", "paypal"] }).notNull(),

  // Statement period
  periodStart: integer("periodStart", { mode: "timestamp" }).notNull(),
  periodEnd: integer("periodEnd", { mode: "timestamp" }).notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),

  // Summary data
  totalRevenue: real("totalRevenue").default(0),
  totalExpenses: real("totalExpenses").default(0),
  totalFees: real("totalFees").default(0),
  netAmount: real("netAmount").default(0),
  transactionCount: integer("transactionCount").default(0),

  // Raw data storage
  rawJson: text("rawJson"),
  transactionsJson: text("transactionsJson"),

  // Statement file (if downloadable)
  fileName: text("fileName"),
  fileUrl: text("fileUrl"),
  fileMimeType: text("fileMimeType"),

  // Status
  status: text("status", { enum: ["pending", "syncing", "synced", "error", "missing"]}).default("pending").notNull(),
  errorMessage: text("errorMessage"),

  // For reconciliation tracking
  reconciled: integer("reconciled", { mode: "boolean" }).default(false).notNull(),
  reconciledAt: integer("reconciledAt", { mode: "timestamp" }),

  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ========== CONNECTOR SYNC LOGS ==========
export const connectorSyncLogs = sqliteTable("connector_sync_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectedAccountId: integer("connectedAccountId").notNull(),
  clientId: integer("clientId").notNull(),
  provider: text("provider", { enum: ["wise", "stripe", "jobber", "touchbistro", "paypal"] }).notNull(),

  syncType: text("syncType", { enum: ["statements", "transactions", "balances", "invoices", "payouts", "all"] }).default("all").notNull(),
  status: text("status", { enum: ["success", "error", "partial"] }).notNull(),
  recordsSynced: integer("recordsSynced").default(0).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: integer("startedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  completedAt: integer("completedAt", { mode: "timestamp" }),
});

// ========== MAKE.COM INTAKE (simple webhook submissions) ==========
export const makeIntake = sqliteTable("make_intake", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  makeId: text("make_id"),
  rawPayload: text("raw_payload"),
  clientName: text("client_name"),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  subject: text("subject"),
  amount: real("amount"),
  vendor: text("vendor"),
  documentType: text("document_type"),
  fileUrl: text("file_url"),
  status: text("status", { enum: ["new", "reviewed", "approved", "rejected", "posted"] }).default("new").notNull(),
  notes: text("notes"),
  assignedClientId: integer("assigned_client_id"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
// Dividend log — records dividend payments to shareholders (drives T5 filing).
// Surfaced on the client Compliance tab when the client's "Dividends" payroll
// feature is on.
export const dividendPayments = sqliteTable("dividend_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  paymentDate: integer("paymentDate", { mode: "timestamp" }),
  recipient: text("recipient"),                 // shareholder receiving the dividend
  recipientSin: text("recipientSin"),           // ENCRYPTED at rest (for the T5 slip)
  amount: real("amount").default(0),
  dividendType: text("dividendType", { enum: ["eligible", "non_eligible"] }).default("non_eligible"),
  taxYear: integer("taxYear"),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// T4A / T5018 slip entries — manual log of contractor (T4A box 048) and
// construction subcontractor (T5018) payments, for printing those slips.
// recipientId (BN or SIN) is ENCRYPTED at rest. Same print engine as the T5.
export const taxSlipEntries = sqliteTable("tax_slip_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  slipType: text("slipType", { enum: ["t4a", "t5018"] }).notNull(),
  recipient: text("recipient"),
  recipientId: text("recipientId"),            // BN/SIN — ENCRYPTED at rest
  amount: real("amount").default(0),
  taxYear: integer("taxYear"),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// INTER-COMPANY (interco) JOURNAL TRACKER
// One entity fronts costs for related entities (e.g. 2303851 Ontario pays for
// Motion Invest / Seahorse payroll), then a monthly "Due to #co" JE trues it up
// between the books. This tracks those bill-backs per month, gates on "all
// source txns posted in QBO", and generates a DRAFT settlement JE for review.
// STAGING + REVIEW ONLY — never posts to QBO (posters stay OFF, golden rule).
// Numbers pull from QBO once the connection is live; manual entry until then.
// GL accounts are user-picked from the LOCKED chart — Figgy never invents one.
export const intercoPeriods = sqliteTable("interco_periods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  period: text("period").notNull(),                 // "YYYY-MM"
  payerClientId: integer("payerClientId").notNull(),// entity that fronts the costs
  // Readiness gate: confirmed all source txns / Visa statements posted in QBO.
  sourcePosted: integer("sourcePosted", { mode: "boolean" }).default(false),
  sourcePostedBy: integer("sourcePostedBy"),
  sourcePostedAt: integer("sourcePostedAt", { mode: "timestamp" }),
  intercoAccount: text("intercoAccount"),           // due-to/from GL, e.g. "1310 Interco:2303851 Ontario"
  offsetAccount: text("offsetAccount"),             // contra GL (bank/clearing/expense) — locked chart
  status: text("status", { enum: ["open", "ready", "posted"] }).default("open").notNull(),
  postedJeRef: text("postedJeRef"),                 // QBO JE number once posted (recorded by hand)
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const intercoEntries = sqliteTable("interco_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  period: text("period").notNull(),                 // "YYYY-MM"
  payerClientId: integer("payerClientId").notNull(),       // who fronted the cost
  counterpartyClientId: integer("counterpartyClientId").notNull(), // who benefited / owes
  description: text("description"),                  // memo, e.g. "Paid by 230 — MI payroll"
  category: text("category"),                        // payroll / expense reimb / reclass / transfer
  amount: real("amount").default(0),                 // positive = counterparty owes payer
  source: text("source", { enum: ["manual", "qbo"] }).default("manual").notNull(),
  sourceRef: text("sourceRef"),                      // QBO txn id when pulled
  createdBy: integer("createdBy"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// PRACTICE SNAPSHOTS — one row per day, captured by a nightly job, so the
// dashboard can draw REAL over-time trend lines (close health, task load,
// outstanding $, review queue) instead of point-in-time bars. Cheap DB-only
// aggregates; idempotent per date (re-running a day overwrites it).
export const practiceSnapshots = sqliteTable("practice_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),            // "YYYY-MM-DD" — one row per day
  clientsActive: integer("clientsActive").default(0),
  clientsTotal: integer("clientsTotal").default(0),
  closeRed: integer("closeRed").default(0),
  closeYellow: integer("closeYellow").default(0),
  closeGreen: integer("closeGreen").default(0),
  toReviewTotal: integer("toReviewTotal").default(0),
  tasksOverdue: integer("tasksOverdue").default(0),
  tasksUpcoming: integer("tasksUpcoming").default(0),
  tasksPending: integer("tasksPending").default(0),
  invoiceOutstanding: real("invoiceOutstanding").default(0),
  invoiceRevenue: real("invoiceRevenue").default(0),
  pipelineValue: real("pipelineValue").default(0),
  pipelineLeads: integer("pipelineLeads").default(0),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Per-client daily snapshot — powers the trend sparkline on the client cockpit
// (to-post backlog + close health over time). One row per client per day.
export const clientSnapshots = sqliteTable("client_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("clientId").notNull(),
  date: text("date").notNull(),                  // "YYYY-MM-DD"
  toReview: integer("toReview").default(0),       // open Triage findings (to-post queue)
  closeStatus: text("closeStatus"),               // red | yellow | green
  openTasks: integer("openTasks").default(0),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
