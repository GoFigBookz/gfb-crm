import { relations } from "drizzle-orm";
import {
  users,
  connectedAccounts,
  clients,
  tasks,
  recurringTasks,
  clientTaskRules,
  clientDashboardSnapshots,
  clientEmails,
  timesheets,
  emails,
  files,
  calendarEvents,
  invoices,
  invoiceItems,
  interactions,
  aiAgentConfigs,
  aiAgentRuns,
  notifications,
  userSettings,
} from "./schema";

export const usersRelations = relations(users, ({ many, one }) => ({
  connectedAccounts: many(connectedAccounts),
  clients: many(clients),
  tasks: many(tasks),
  recurringTasks: many(recurringTasks),
  emails: many(emails),
  files: many(files),
  calendarEvents: many(calendarEvents),
  invoices: many(invoices),
  interactions: many(interactions),
  aiAgents: many(aiAgentConfigs),
  aiAgentRuns: many(aiAgentRuns),
  notifications: many(notifications),
  settings: one(userSettings, {
    fields: [users.id],
    references: [userSettings.userId],
  }),
}));

export const connectedAccountsRelations = relations(connectedAccounts, ({ one, many }) => ({
  user: one(users, {
    fields: [connectedAccounts.userId],
    references: [users.id],
  }),
  emails: many(emails),
  files: many(files),
  calendarEvents: many(calendarEvents),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  user: one(users, {
    fields: [clients.userId],
    references: [users.id],
  }),
  tasks: many(tasks),
  recurringTasks: many(recurringTasks),
  taskRules: many(clientTaskRules),
  dashboardSnapshots: many(clientDashboardSnapshots),
  clientEmails: many(clientEmails),
  timesheets: many(timesheets),
  emails: many(emails),
  files: many(files),
  calendarEvents: many(calendarEvents),
  invoices: many(invoices),
  interactions: many(interactions),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id],
  }),
  client: one(clients, {
    fields: [tasks.clientId],
    references: [clients.id],
  }),
}));

export const recurringTasksRelations = relations(recurringTasks, ({ one }) => ({
  user: one(users, {
    fields: [recurringTasks.userId],
    references: [users.id],
  }),
  client: one(clients, {
    fields: [recurringTasks.clientId],
    references: [clients.id],
  }),
}));

export const clientTaskRulesRelations = relations(clientTaskRules, ({ one }) => ({
  user: one(users, {
    fields: [clientTaskRules.userId],
    references: [users.id],
  }),
  client: one(clients, {
    fields: [clientTaskRules.clientId],
    references: [clients.id],
  }),
}));

export const emailsRelations = relations(emails, ({ one }) => ({
  user: one(users, {
    fields: [emails.userId],
    references: [users.id],
  }),
  connectedAccount: one(connectedAccounts, {
    fields: [emails.connectedAccountId],
    references: [connectedAccounts.id],
  }),
  client: one(clients, {
    fields: [emails.clientId],
    references: [clients.id],
  }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  user: one(users, {
    fields: [files.userId],
    references: [users.id],
  }),
  connectedAccount: one(connectedAccounts, {
    fields: [files.connectedAccountId],
    references: [connectedAccounts.id],
  }),
  client: one(clients, {
    fields: [files.clientId],
    references: [clients.id],
  }),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  user: one(users, {
    fields: [calendarEvents.userId],
    references: [users.id],
  }),
  connectedAccount: one(connectedAccounts, {
    fields: [calendarEvents.connectedAccountId],
    references: [connectedAccounts.id],
  }),
  client: one(clients, {
    fields: [calendarEvents.clientId],
    references: [clients.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  user: one(users, {
    fields: [invoices.userId],
    references: [users.id],
  }),
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  items: many(invoiceItems),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
}));

export const interactionsRelations = relations(interactions, ({ one }) => ({
  user: one(users, {
    fields: [interactions.userId],
    references: [users.id],
  }),
  client: one(clients, {
    fields: [interactions.clientId],
    references: [clients.id],
  }),
}));

export const aiAgentConfigsRelations = relations(aiAgentConfigs, ({ one, many }) => ({
  user: one(users, {
    fields: [aiAgentConfigs.userId],
    references: [users.id],
  }),
  runs: many(aiAgentRuns),
}));

export const aiAgentRunsRelations = relations(aiAgentRuns, ({ one }) => ({
  agent: one(aiAgentConfigs, {
    fields: [aiAgentRuns.agentId],
    references: [aiAgentConfigs.id],
  }),
  user: one(users, {
    fields: [aiAgentRuns.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));
