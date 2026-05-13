/**
 * SHEET EXPORT ROUTER
 * Exports CRM data to Google Sheets for the review pipeline.
 */
import { z } from "zod";
import { createRouter, seniorQuery, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, timeEntries, tasks } from "../db/schema";
import { eq, desc, gte, and } from "drizzle-orm";

export const sheetExportRouter = createRouter({
  // Export client time summary (for profitability review)
  exportClientTimeSummary: seniorQuery.query(async () => {
    const db = getDb();
    const allClients = await db.select().from(clients).where(eq(clients.status, "active"));

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const rows = [];
    for (const client of allClients) {
      const entries = await db.select()
        .from(timeEntries)
        .where(and(eq(timeEntries.clientId, client.id), gte(timeEntries.date, startOfMonth)));

      const totalHours = entries.reduce((s, e) => s + (e.hours || 0), 0);
      const monthlyFee = client.monthlyFee || 0;
      const effectiveRate = totalHours > 0 ? (monthlyFee / totalHours).toFixed(2) : "N/A";

      rows.push({
        Client: client.name,
        "Monthly Fee": monthlyFee,
        "Hours This Month": totalHours.toFixed(1),
        "Effective Rate": effectiveRate,
        "QBO Firm": client.qboAccountType || "ca_clients",
        Status: totalHours > 0 ? (parseFloat(effectiveRate) >= 50 ? "PROFITABLE" : "REVIEW") : "NO HOURS",
      });
    }

    return { rows, sheetName: `Client Profitability - ${now.toLocaleString("en-US", { month: "long", year: "numeric" })}` };
  }),

  // Export task status for review
  exportTaskStatus: seniorQuery.query(async () => {
    const db = getDb();
    const allTasks = await db.select().from(tasks).orderBy(desc(tasks.dueDate));

    const rows = allTasks.map((t) => ({
      Task: t.title,
      Client: t.clientId || "N/A",
      Assigned: t.assignedTo || "Unassigned",
      Status: t.status,
      Completed: t.completed ? "YES" : "NO",
      "Due Date": t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-CA") : "",
      Category: t.category || "",
    }));

    return { rows, sheetName: `Task Status - ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}` };
  }),

  // Export client list with key info
  exportClientDirectory: seniorQuery.query(async () => {
    const db = getDb();
    const allClients = await db.select().from(clients);

    const rows = allClients.map((c) => ({
      Name: c.name,
      Company: c.company || "",
      Email: c.email,
      Phone: c.phone || "",
      Status: c.status,
      "QBO Firm": c.qboAccountType || "ca_clients",
      "Monthly Fee": c.monthlyFee || 0,
      Assigned: c.assignedTo || "Unassigned",
      "Last Contacted": c.lastContactedAt ? new Date(c.lastContactedAt).toLocaleDateString("en-CA") : "Never",
    }));

    return { rows, sheetName: "Client Directory" };
  }),
});
