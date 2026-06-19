import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { qboConnections, qboSyncLogs, qboCustomers, qboInvoices, qboPayments, qboAccounts, clients } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { qboRequestViaMake } from "./qbo-make-bridge";
import { accessTokenFor, refreshNativeToken, ensureValidNativeToken, buildAuthorizeUrl, exchangeAndPersist } from "./qbo-oauth";

// QBO API base URLs
const QBO_BASE_URLS = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
};

// OAuth (authorize URL, token exchange, refresh, encryption) lives in qbo-oauth.ts.

// Strip token/secret fields before a connection is sent to the browser. Tokens
// are encrypted at rest, but the UI never needs them — don't expose them at all.
function safeConnection(c: typeof qboConnections.$inferSelect) {
  const { accessToken, refreshToken, bridgeSecret, ...safe } = c;
  return { ...safe, connected: Boolean(accessToken) || c.transport === "make_bridge" };
}

// Helper: make an authenticated request to QBO API
export async function qboRequest(
  connection: typeof qboConnections.$inferSelect,
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown
) {
  // Bridge transport: run the per-realm Make scenario (Make holds the tokens).
  if (connection.transport === "make_bridge") {
    return qboRequestViaMake(
      {
        bridgeUrl: connection.bridgeUrl || "",
        apiToken: connection.bridgeSecret || process.env.FIGGY_MAKE_API_TOKEN || "",
        realmId: connection.realmId,
      },
      endpoint,
      method,
      body,
    );
  }
  const base = QBO_BASE_URLS[connection.environment as "sandbox" | "production"];
  const url = `${base}/v3/company/${connection.realmId}${endpoint}`;
  // Tokens are encrypted at rest — decrypt just-in-time for the Bearer header.
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessTokenFor(connection)}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`QBO API ${method} ${endpoint} failed: ${res.status} ${errText}`);
  }
  return res.json();
}

// Helper: ensure token is valid before making a request. Native refresh +
// token encryption + rotation persistence + reconnect handling all live in
// qbo-oauth.ts (the single hardened OAuth path).
export async function ensureValidToken(connection: typeof qboConnections.$inferSelect) {
  // Bridge connections have no local tokens — Make refreshes its own.
  if (connection.transport === "make_bridge") return connection;
  return ensureValidNativeToken(connection);
}

// Simple fuzzy string matcher (Jaccard similarity on word sets)
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// ================================================================
// Standalone sync functions (called by both router endpoints and webhook)
// ================================================================

async function doSyncCustomers(connectionId: number) {
  const db = getDb();
  const connRow = await db.select().from(qboConnections).where(eq(qboConnections.id, connectionId)).limit(1);
  if (!connRow[0]) throw new Error("Connection not found");
  const connection = await ensureValidToken(connRow[0]);
  const clientId = connection.clientId; // propagate client assignment

  const data = await qboRequest(connection, "/query?query=SELECT * FROM Customer MAXRESULTS 1000");
  const customers = (data.QueryResponse?.Customer || []) as Record<string, unknown>[];

  let inserted = 0;
  for (const c of customers) {
    const existing = await db.select().from(qboCustomers)
      .where(and(eq(qboCustomers.connectionId, connectionId), eq(qboCustomers.qboCustomerId, String(c.Id))));
    const row = {
      connectionId: connectionId,
      clientId, // NEW: auto-tag with client
      qboCustomerId: String(c.Id),
      displayName: (c.DisplayName as string) || null,
      companyName: (c.CompanyName as string) || null,
      givenName: (c.GivenName as string) || null,
      familyName: (c.FamilyName as string) || null,
      email: (c.PrimaryEmailAddr as Record<string, string>)?.Address || null,
      phone: (c.PrimaryPhone as Record<string, string>)?.FreeFormNumber || null,
      mobile: (c.Mobile as Record<string, string>)?.FreeFormNumber || null,
      fax: (c.Fax as Record<string, string>)?.FreeFormNumber || null,
      addressLine1: (c.BillAddr as Record<string, string>)?.Line1 || null,
      addressLine2: (c.BillAddr as Record<string, string>)?.Line2 || null,
      city: (c.BillAddr as Record<string, string>)?.City || null,
      state: (c.BillAddr as Record<string, string>)?.CountrySubDivisionCode || null,
      postalCode: (c.BillAddr as Record<string, string>)?.PostalCode || null,
      country: (c.BillAddr as Record<string, string>)?.Country || null,
      balance: (c.Balance as number) || 0,
      taxable: (c.Taxable as boolean) !== false,
      active: (c.Active as boolean) !== false,
      notes: (c.Notes as string) || null,
      lastUpdatedAt: (c.MetaData as Record<string, string>)?.LastUpdatedTime ? new Date((c.MetaData as Record<string, string>).LastUpdatedTime) : null,
      updatedAt: new Date(),
    };
    if (existing[0]) {
      await db.update(qboCustomers).set(row).where(eq(qboCustomers.id, existing[0].id));
    } else {
      await db.insert(qboCustomers).values(row);
      inserted++;
    }
  }

  await db.insert(qboSyncLogs).values({
    connectionId: connectionId,
    entityType: "customers",
    status: "success",
    recordsSynced: customers.length,
    completedAt: new Date(),
  });
  await db.update(qboConnections).set({ lastSyncedAt: new Date() }).where(eq(qboConnections.id, connectionId));

  return { success: true, recordsSynced: customers.length, inserted };
}

async function doSyncInvoices(connectionId: number) {
  const db = getDb();
  const connRow = await db.select().from(qboConnections).where(eq(qboConnections.id, connectionId)).limit(1);
  if (!connRow[0]) throw new Error("Connection not found");
  const connection = await ensureValidToken(connRow[0]);
  const clientId = connection.clientId;

  const data = await qboRequest(connection, "/query?query=SELECT * FROM Invoice MAXRESULTS 1000");
  const invoices = (data.QueryResponse?.Invoice || []) as Record<string, unknown>[];

  for (const inv of invoices) {
    const existing = await db.select().from(qboInvoices)
      .where(and(eq(qboInvoices.connectionId, connectionId), eq(qboInvoices.qboInvoiceId, String(inv.Id))));
    const row = {
      connectionId: connectionId,
      clientId, // NEW
      qboInvoiceId: String(inv.Id),
      qboCustomerId: (inv.CustomerRef as Record<string, unknown>)?.value as string || null,
      invoiceNumber: (inv.DocNumber as string) || null,
      docNumber: (inv.DocNumber as string) || null,
      transactionDate: (inv.TxnDate as string) ? new Date(inv.TxnDate as string) : null,
      dueDate: (inv.DueDate as string) ? new Date(inv.DueDate as string) : null,
      totalAmount: (inv.TotalAmt as number) || 0,
      balance: (inv.Balance as number) || 0,
      status: (inv.Balance as number) === 0 ? "paid" as const : "sent" as const,
      lineItems: inv.Line ? JSON.stringify(inv.Line) : null,
      memo: (inv.CustomerMemo as Record<string, string>)?.value || null,
      privateNote: (inv.PrivateNote as string) || null,
      lastUpdatedAt: (inv.MetaData as Record<string, string>)?.LastUpdatedTime ? new Date((inv.MetaData as Record<string, string>).LastUpdatedTime) : null,
      updatedAt: new Date(),
    };
    if (existing[0]) {
      await db.update(qboInvoices).set(row).where(eq(qboInvoices.id, existing[0].id));
    } else {
      await db.insert(qboInvoices).values(row);
    }
  }

  await db.insert(qboSyncLogs).values({
    connectionId: connectionId,
    entityType: "invoices",
    status: "success",
    recordsSynced: invoices.length,
    completedAt: new Date(),
  });

  return { success: true, recordsSynced: invoices.length };
}

async function doSyncPayments(connectionId: number) {
  const db = getDb();
  const connRow = await db.select().from(qboConnections).where(eq(qboConnections.id, connectionId)).limit(1);
  if (!connRow[0]) throw new Error("Connection not found");
  const connection = await ensureValidToken(connRow[0]);
  const clientId = connection.clientId;

  const data = await qboRequest(connection, "/query?query=SELECT * FROM Payment MAXRESULTS 1000");
  const payments = (data.QueryResponse?.Payment || []) as Record<string, unknown>[];

  for (const p of payments) {
    const existing = await db.select().from(qboPayments)
      .where(and(eq(qboPayments.connectionId, connectionId), eq(qboPayments.qboPaymentId, String(p.Id))));
    const row = {
      connectionId: connectionId,
      clientId, // NEW
      qboPaymentId: String(p.Id),
      qboCustomerId: (p.CustomerRef as Record<string, unknown>)?.value as string || null,
      totalAmount: (p.TotalAmt as number) || 0,
      unappliedAmount: (p.UnappliedAmt as number) || 0,
      paymentMethod: (p.PaymentMethodRef as Record<string, string>)?.name || null,
      transactionDate: (p.TxnDate as string) ? new Date(p.TxnDate as string) : null,
      status: (p.status as string) || "completed",
      memo: (p.PrivateNote as string) || null,
      lastUpdatedAt: (p.MetaData as Record<string, string>)?.LastUpdatedTime ? new Date((p.MetaData as Record<string, string>).LastUpdatedTime) : null,
      updatedAt: new Date(),
    };
    if (existing[0]) {
      await db.update(qboPayments).set(row).where(eq(qboPayments.id, existing[0].id));
    } else {
      await db.insert(qboPayments).values(row);
    }
  }

  await db.insert(qboSyncLogs).values({
    connectionId: connectionId,
    entityType: "payments",
    status: "success",
    recordsSynced: payments.length,
    completedAt: new Date(),
  });

  return { success: true, recordsSynced: payments.length };
}

async function doSyncAccounts(connectionId: number) {
  const db = getDb();
  const connRow = await db.select().from(qboConnections).where(eq(qboConnections.id, connectionId)).limit(1);
  if (!connRow[0]) throw new Error("Connection not found");
  const connection = await ensureValidToken(connRow[0]);

  const data = await qboRequest(connection, "/query?query=SELECT * FROM Account MAXRESULTS 1000");
  const accounts = (data.QueryResponse?.Account || []) as Record<string, unknown>[];

  for (const a of accounts) {
    const existing = await db.select().from(qboAccounts)
      .where(and(eq(qboAccounts.connectionId, connectionId), eq(qboAccounts.qboAccountId, String(a.Id))));
    const row = {
      connectionId: connectionId,
      qboAccountId: String(a.Id),
      name: (a.Name as string) || null,
      accountType: (a.AccountType as string) || null,
      accountSubType: (a.AccountSubType as string) || null,
      classification: (a.Classification as string) || null,
      currentBalance: (a.CurrentBalance as number) || 0,
      currencyRef: (a.CurrencyRef as Record<string, string>)?.value || null,
      active: (a.Active as boolean) !== false,
      lastUpdatedAt: (a.MetaData as Record<string, string>)?.LastUpdatedTime ? new Date((a.MetaData as Record<string, string>).LastUpdatedTime) : null,
      updatedAt: new Date(),
    };
    if (existing[0]) {
      await db.update(qboAccounts).set(row).where(eq(qboAccounts.id, existing[0].id));
    } else {
      await db.insert(qboAccounts).values(row);
    }
  }

  await db.insert(qboSyncLogs).values({
    connectionId: connectionId,
    entityType: "accounts",
    status: "success",
    recordsSynced: accounts.length,
    completedAt: new Date(),
  });

  return { success: true, recordsSynced: accounts.length };
}

// ================================================================
// Router
// ================================================================

export const qboRouter = createRouter({
  // --- OAuth Flow (Dual-Company: CA + US) ---

  getAuthUrl: publicQuery
    .input(z.object({
      environment: z.enum(["sandbox", "production"]).optional().default("production"),
      // Which CRM client this QBO company belongs to. Carried (signed) in state
      // so the callback binds the realm to the right client = per-client isolation.
      clientId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const { url, state } = buildAuthorizeUrl({ clientId: input.clientId ?? null, env: input.environment });
      return { url, state };
    }),

  // The live callback is the HTTP GET route /api/qbo/callback (Intuit redirects
  // the browser there). This mutation is kept for programmatic use and shares
  // the SAME hardened path: signed-state verification, client binding, and
  // encrypted-at-rest token storage all live in qbo-oauth.exchangeAndPersist.
  callback: publicQuery
    .input(z.object({
      code: z.string(),
      realmId: z.string(),
      state: z.string(),
    }))
    .mutation(async ({ input }) => {
      const r = await exchangeAndPersist({ code: input.code, realmId: input.realmId, stateRaw: input.state });
      return { success: true, ...r };
    }),

  // --- Connection Management ---

  // NOTE: never ship tokens/secrets to the browser — project only safe fields.
  listConnections: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db.select().from(qboConnections).orderBy(desc(qboConnections.createdAt));
    return rows.map(safeConnection);
  }),

  // Per-client connection summary for the client page's Connect/Reconnect control.
  // Mirrors the brain's isolation rule: 0 = none, 2+ = ambiguous (never picks one).
  connectionForClient: publicQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(qboConnections)
        .where(eq(qboConnections.clientId, input.clientId)).orderBy(desc(qboConnections.createdAt));
      const active = rows.filter((r) => r.isActive);
      return {
        connection: rows[0] ? safeConnection(rows[0]) : null,
        count: rows.length,
        ambiguous: active.length > 1,
      };
    }),

  getConnectionByType: publicQuery
    .input(z.object({ accountType: z.enum(["ca_clients", "us_clients", "personal_business"]) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(qboConnections)
        .where(and(eq(qboConnections.accountType, input.accountType), eq(qboConnections.isActive, true)))
        .orderBy(desc(qboConnections.createdAt))
        .limit(1);
      return rows[0] || null;
    }),

  deleteConnection: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(qboConnections).where(eq(qboConnections.id, input.id));
      return { success: true };
    }),

  toggleConnection: publicQuery
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(qboConnections).set({ isActive: input.active }).where(eq(qboConnections.id, input.id));
      return { success: true };
    }),

  // --- Sync Engine (individual endpoints) ---

  syncCustomers: publicQuery
    .input(z.object({ connectionId: z.number() }))
    .mutation(async ({ input }) => doSyncCustomers(input.connectionId)),

  syncInvoices: publicQuery
    .input(z.object({ connectionId: z.number() }))
    .mutation(async ({ input }) => doSyncInvoices(input.connectionId)),

  syncPayments: publicQuery
    .input(z.object({ connectionId: z.number() }))
    .mutation(async ({ input }) => doSyncPayments(input.connectionId)),

  syncAccounts: publicQuery
    .input(z.object({ connectionId: z.number() }))
    .mutation(async ({ input }) => doSyncAccounts(input.connectionId)),

  // --- Sync All ---

  syncAll: publicQuery
    .input(z.object({ connectionId: z.number() }))
    .mutation(async ({ input }) => {
      const r1 = await doSyncCustomers(input.connectionId);
      const r2 = await doSyncInvoices(input.connectionId);
      const r3 = await doSyncPayments(input.connectionId);
      const r4 = await doSyncAccounts(input.connectionId);
      return { success: true, customers: r1, invoices: r2, payments: r3, accounts: r4 };
    }),

  // --- Data Retrieval ---

  getCustomers: publicQuery
    .input(z.object({ connectionId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (input?.connectionId) {
        return db.select().from(qboCustomers).where(eq(qboCustomers.connectionId, input.connectionId)).orderBy(qboCustomers.displayName);
      }
      return db.select().from(qboCustomers).orderBy(qboCustomers.displayName);
    }),

  getInvoices: publicQuery
    .input(z.object({ connectionId: z.number().optional(), status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (input?.connectionId) {
        return db.select().from(qboInvoices).where(eq(qboInvoices.connectionId, input.connectionId)).orderBy(desc(qboInvoices.transactionDate));
      }
      return db.select().from(qboInvoices).orderBy(desc(qboInvoices.transactionDate));
    }),

  getPayments: publicQuery
    .input(z.object({ connectionId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (input?.connectionId) {
        return db.select().from(qboPayments).where(eq(qboPayments.connectionId, input.connectionId)).orderBy(desc(qboPayments.transactionDate));
      }
      return db.select().from(qboPayments).orderBy(desc(qboPayments.transactionDate));
    }),

  getAccounts: publicQuery
    .input(z.object({ connectionId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (input?.connectionId) {
        return db.select().from(qboAccounts).where(eq(qboAccounts.connectionId, input.connectionId)).orderBy(qboAccounts.name);
      }
      return db.select().from(qboAccounts).orderBy(qboAccounts.name);
    }),

  getSyncLogs: publicQuery
    .input(z.object({ connectionId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (input?.connectionId) {
        return db.select().from(qboSyncLogs).where(eq(qboSyncLogs.connectionId, input.connectionId)).orderBy(desc(qboSyncLogs.startedAt));
      }
      return db.select().from(qboSyncLogs).orderBy(desc(qboSyncLogs.startedAt));
    }),

  // --- Dashboard Stats ---

  getStats: publicQuery.query(async () => {
    const db = getDb();
    const allCustomers = await db.select().from(qboCustomers);
    const allInvoices = await db.select().from(qboInvoices);
    const allPayments = await db.select().from(qboPayments);
    const allAccounts = await db.select().from(qboAccounts);
    const connections = await db.select().from(qboConnections);

    const totalRevenue = allPayments.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const outstanding = allInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);
    const paidInvoices = allInvoices.filter(i => (i.balance || 0) <= 0).length;

    return {
      connections: connections.length,
      customers: allCustomers.length,
      invoices: allInvoices.length,
      payments: allPayments.length,
      accounts: allAccounts.length,
      totalRevenue,
      outstanding,
      paidInvoices,
    };
  }),

  // --- Triage / Review Queue ---

  getPendingReview: publicQuery
    .input(z.object({
      connectionId: z.number().optional(),
      entityType: z.enum(["invoices", "payments", "all"]).default("all"),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const wherePending = eq(qboInvoices.reviewStatus, "pending");
      
      let invoiceRows: any[] = [];
      let paymentRows: any[] = [];

      if (!input || input.entityType === "all" || input.entityType === "invoices") {
        const query = db.select().from(qboInvoices).where(wherePending).orderBy(desc(qboInvoices.transactionDate));
        if (input?.connectionId) {
          invoiceRows = await db.select().from(qboInvoices)
            .where(and(eq(qboInvoices.connectionId, input.connectionId), eq(qboInvoices.reviewStatus, "pending")))
            .orderBy(desc(qboInvoices.transactionDate));
        } else {
          invoiceRows = await query;
        }
      }

      if (!input || input.entityType === "all" || input.entityType === "payments") {
        if (input?.connectionId) {
          paymentRows = await db.select().from(qboPayments)
            .where(and(eq(qboPayments.connectionId, input.connectionId), eq(qboPayments.reviewStatus, "pending")))
            .orderBy(desc(qboPayments.transactionDate));
        } else {
          paymentRows = await db.select().from(qboPayments).where(eq(qboPayments.reviewStatus, "pending")).orderBy(desc(qboPayments.transactionDate));
        }
      }

      // Fetch QBO customer names for display
      const customerIds = new Set([...invoiceRows.map(r => r.qboCustomerId), ...paymentRows.map(r => r.qboCustomerId)]);
      const customers = await db.select().from(qboCustomers).where(eq(qboCustomers.qboCustomerId, [...customerIds][0] || ""));
      const customerMap = new Map(customers.map(c => [c.qboCustomerId, c.displayName || c.companyName]));

      return {
        invoices: invoiceRows.map(r => ({ ...r, qboCustomerName: customerMap.get(r.qboCustomerId) || "Unknown" })),
        payments: paymentRows.map(r => ({ ...r, qboCustomerName: customerMap.get(r.qboCustomerId) || "Unknown" })),
        totalPending: invoiceRows.length + paymentRows.length,
      };
    }),

  suggestClientMatches: publicQuery.query(async () => {
    const db = getDb();
    // Get all QBO customers that don't have a mapped client
    const unmappedQboCustomers = await db.select().from(qboCustomers).where(eq(qboCustomers.clientId, 0));
    // Get all CRM clients
    const crmClients = await db.select().from(clients);

    const suggestions = unmappedQboCustomers.map(qboCust => {
      const qboName = (qboCust.displayName || qboCust.companyName || "").toLowerCase();
      // Simple fuzzy match: find CRM client with closest name
      let bestMatch = null;
      let bestScore = 0;
      for (const client of crmClients) {
        const clientName = (client.companyName || client.name || "").toLowerCase();
        const score = jaccardSimilarity(qboName, clientName);
        if (score > bestScore && score > 0.3) {
          bestScore = score;
          bestMatch = client;
        }
      }
      return {
        qboCustomerId: qboCust.qboCustomerId,
        qboDisplayName: qboCust.displayName,
        qboCompanyName: qboCust.companyName,
        suggestedClientId: bestMatch?.id || null,
        suggestedClientName: bestMatch?.companyName || bestMatch?.name || null,
        confidence: bestScore,
      };
    });

    return { suggestions };
  }),

  mapQboCustomerToClient: publicQuery
    .input(z.object({
      qboCustomerId: z.string(),
      clientId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(qboCustomers)
        .set({ clientId: input.clientId })
        .where(eq(qboCustomers.qboCustomerId, input.qboCustomerId));
      return { success: true };
    }),

  approveItems: publicQuery
    .input(z.object({
      invoiceIds: z.array(z.number()).optional(),
      paymentIds: z.array(z.number()).optional(),
      clientId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const now = new Date();
      let updated = 0;

      if (input.invoiceIds && input.invoiceIds.length > 0) {
        for (const id of input.invoiceIds) {
          await db.update(qboInvoices)
            .set({
              reviewStatus: "posted",
              clientId: input.clientId || undefined,
              reviewedAt: now,
            })
            .where(eq(qboInvoices.id, id));
          updated++;
        }
      }

      if (input.paymentIds && input.paymentIds.length > 0) {
        for (const id of input.paymentIds) {
          await db.update(qboPayments)
            .set({
              reviewStatus: "posted",
              clientId: input.clientId || undefined,
              reviewedAt: now,
            })
            .where(eq(qboPayments.id, id));
          updated++;
        }
      }

      return { success: true, updated };
    }),

  rejectItems: publicQuery
    .input(z.object({
      invoiceIds: z.array(z.number()).optional(),
      paymentIds: z.array(z.number()).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const now = new Date();
      let updated = 0;

      if (input.invoiceIds && input.invoiceIds.length > 0) {
        for (const id of input.invoiceIds) {
          await db.update(qboInvoices)
            .set({ reviewStatus: "rejected", reviewedAt: now, reviewNotes: input.notes || null })
            .where(eq(qboInvoices.id, id));
          updated++;
        }
      }

      if (input.paymentIds && input.paymentIds.length > 0) {
        for (const id of input.paymentIds) {
          await db.update(qboPayments)
            .set({ reviewStatus: "rejected", reviewedAt: now, reviewNotes: input.notes || null })
            .where(eq(qboPayments.id, id));
          updated++;
        }
      }

      return { success: true, updated };
    }),

  // ========== QBO TRIAGE (Assign unassigned data to clients) ==========

  // Assign a QBO connection to a CRM client (and retroactively tag all its data)
  assignClient: publicQuery
    .input(z.object({
      connectionId: z.number(),
      clientId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // Update the connection
      await db
        .update(qboConnections)
        .set({ clientId: input.clientId, updatedAt: new Date() })
        .where(eq(qboConnections.id, input.connectionId));

      // Retroactively tag all existing records for this connection
      await db
        .update(qboCustomers)
        .set({ clientId: input.clientId })
        .where(eq(qboCustomers.connectionId, input.connectionId));
      await db
        .update(qboInvoices)
        .set({ clientId: input.clientId })
        .where(eq(qboInvoices.connectionId, input.connectionId));
      await db
        .update(qboPayments)
        .set({ clientId: input.clientId })
        .where(eq(qboPayments.connectionId, input.connectionId));

      return {
        success: true,
        message: `QBO connection assigned to client ${input.clientId}. All existing records retagged.`,
      };
    }),

  // Get all unassigned QBO data for triage review
  getTriage: publicQuery.query(async () => {
    const db = getDb();

    // Unassigned connections (no client linked)
    const unassignedConnections = await db
      .select()
      .from(qboConnections)
      .where(eq(qboConnections.clientId, null))
      .orderBy(desc(qboConnections.createdAt));

    // Unassigned records (shouldn't happen if connection has client, but catches edge cases)
    const unassignedCustomers = await db
      .select()
      .from(qboCustomers)
      .where(eq(qboCustomers.clientId, null))
      .limit(50);
    const unassignedInvoices = await db
      .select()
      .from(qboInvoices)
      .where(eq(qboInvoices.clientId, null))
      .limit(50);
    const unassignedPayments = await db
      .select()
      .from(qboPayments)
      .where(eq(qboPayments.clientId, null))
      .limit(50);

    return {
      connections: unassignedConnections,
      customers: unassignedCustomers,
      invoices: unassignedInvoices,
      payments: unassignedPayments,
      summary: {
        unassignedConnections: unassignedConnections.length,
        unassignedCustomers: unassignedCustomers.length,
        unassignedInvoices: unassignedInvoices.length,
        unassignedPayments: unassignedPayments.length,
      },
    };
  }),

  // Assign individual records to a client (for one-off fixes)
  assignRecords: publicQuery
    .input(z.object({
      entityType: z.enum(["customers", "invoices", "payments"]),
      ids: z.array(z.number()),
      clientId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const table =
        input.entityType === "customers" ? qboCustomers :
        input.entityType === "invoices" ? qboInvoices :
        qboPayments;

      for (const id of input.ids) {
        await db.update(table).set({ clientId: input.clientId }).where(eq(table.id, id));
      }

      return {
        success: true,
        assigned: input.ids.length,
        entityType: input.entityType,
        clientId: input.clientId,
      };
    }),
});
