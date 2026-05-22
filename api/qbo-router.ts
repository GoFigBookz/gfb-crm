import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { qboConnections, qboSyncLogs, qboCustomers, qboInvoices, qboPayments, qboAccounts } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

// QBO API base URLs
const QBO_BASE_URLS = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
};

// Token endpoints
const TOKEN_URLS = {
  sandbox: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  production: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
};

// Client credentials from env
function getCredentials() {
  return {
    clientId: process.env.QBO_CLIENT_ID || process.env.SANDBOX_QBO_CLIENT_ID || "",
    clientSecret: process.env.QBO_CLIENT_SECRET || process.env.SANDBOX_QBO_CLIENT_SECRET || "",
    redirectUri: `${process.env.VITE_APP_URL || "http://localhost:3000"}/api/qbo/callback`,
  };
}

// Helper: make an authenticated request to QBO API
async function qboRequest(
  connection: typeof qboConnections.$inferSelect,
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown
) {
  const base = QBO_BASE_URLS[connection.environment as "sandbox" | "production"];
  const url = `${base}/v3/company/${connection.realmId}${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.accessToken}`,
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

// Helper: refresh an access token
async function refreshToken(connection: typeof qboConnections.$inferSelect) {
  const { clientId, clientSecret } = getCredentials();
  const tokenUrl = TOKEN_URLS[connection.environment as "sandbox" | "production"];
  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", connection.refreshToken || "");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  const newAccessToken = data.access_token;
  const newRefreshToken = data.refresh_token || connection.refreshToken;
  const expiresIn = data.expires_in || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  const db = getDb();
  await db
    .update(qboConnections)
    .set({ accessToken: newAccessToken, refreshToken: newRefreshToken, expiresAt })
    .where(eq(qboConnections.id, connection.id));

  return { ...connection, accessToken: newAccessToken, refreshToken: newRefreshToken, expiresAt };
}

// Helper: ensure token is valid before making a request
async function ensureValidToken(connection: typeof qboConnections.$inferSelect) {
  const now = new Date();
  const expiry = connection.expiresAt;
  if (!expiry || expiry.getTime() - now.getTime() < 5 * 60 * 1000) {
    return refreshToken(connection);
  }
  return connection;
}

// ================================================================
// Standalone sync functions (called by both router endpoints and webhook)
// ================================================================

async function doSyncCustomers(connectionId: number) {
  const db = getDb();
  const connRow = await db.select().from(qboConnections).where(eq(qboConnections.id, connectionId)).limit(1);
  if (!connRow[0]) throw new Error("Connection not found");
  let connection = await ensureValidToken(connRow[0]);

  const data = await qboRequest(connection, "/query?query=SELECT * FROM Customer MAXRESULTS 1000");
  const customers = (data.QueryResponse?.Customer || []) as Record<string, unknown>[];

  let inserted = 0;
  for (const c of customers) {
    const existing = await db.select().from(qboCustomers)
      .where(and(eq(qboCustomers.connectionId, connectionId), eq(qboCustomers.qboCustomerId, String(c.Id))));
    const row = {
      connectionId: connectionId,
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
  let connection = await ensureValidToken(connRow[0]);

  const data = await qboRequest(connection, "/query?query=SELECT * FROM Invoice MAXRESULTS 1000");
  const invoices = (data.QueryResponse?.Invoice || []) as Record<string, unknown>[];

  for (const inv of invoices) {
    const existing = await db.select().from(qboInvoices)
      .where(and(eq(qboInvoices.connectionId, connectionId), eq(qboInvoices.qboInvoiceId, String(inv.Id))));
    const row = {
      connectionId: connectionId,
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
  let connection = await ensureValidToken(connRow[0]);

  const data = await qboRequest(connection, "/query?query=SELECT * FROM Payment MAXRESULTS 1000");
  const payments = (data.QueryResponse?.Payment || []) as Record<string, unknown>[];

  for (const p of payments) {
    const existing = await db.select().from(qboPayments)
      .where(and(eq(qboPayments.connectionId, connectionId), eq(qboPayments.qboPaymentId, String(p.Id))));
    const row = {
      connectionId: connectionId,
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
  let connection = await ensureValidToken(connRow[0]);

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
      environment: z.enum(["sandbox", "production"]).optional().default("sandbox"),
      accountType: z.enum(["ca_clients", "us_clients", "personal_business"]).optional().default("ca_clients"),
    }))
    .query(async ({ input }) => {
      const { clientId, redirectUri } = getCredentials();
      const scopes = [
        "com.intuit.quickbooks.accounting",
        "com.intuit.quickbooks.payment",
      ].join(" ");
      const state = Buffer.from(JSON.stringify({
        env: input.environment,
        accountType: input.accountType,
        ts: Date.now(),
      })).toString("base64url");

      const url = `https://appcenter.intuit.com/connect/oauth2?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scopes,
        response_type: "code",
        state,
      })}`;

      return { url, state, accountType: input.accountType };
    }),

  callback: publicQuery
    .input(z.object({
      code: z.string(),
      realmId: z.string(),
      state: z.string(),
    }))
    .mutation(async ({ input }) => {
      let env: string = "sandbox";
      let accountType: string = "ca_clients";
      try {
        const parsed = JSON.parse(Buffer.from(input.state, "base64url").toString());
        env = parsed.env || "sandbox";
        accountType = parsed.accountType || "ca_clients";
      } catch { /* ignore */ }

      const { clientId, clientSecret, redirectUri } = getCredentials();
      const tokenUrl = TOKEN_URLS[env as "sandbox" | "production"];

      const params = new URLSearchParams();
      params.append("grant_type", "authorization_code");
      params.append("code", input.code);
      params.append("redirect_uri", redirectUri);
      params.append("client_id", clientId);
      params.append("client_secret", clientSecret);

      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OAuth callback failed: ${res.status} ${err}`);
      }
      const data = await res.json();

      // Fetch company info
      const companyInfo = await fetch(
        `${QBO_BASE_URLS[env as "sandbox" | "production"]}/v3/company/${input.realmId}/companyinfo/${input.realmId}`,
        { headers: { Authorization: `Bearer ${data.access_token}`, Accept: "application/json" } }
      );
      let companyName: string | null = null;
      let companyEmail: string | null = null;
      if (companyInfo.ok) {
        const cInfo = await companyInfo.json();
        companyName = cInfo.CompanyInfo?.CompanyName || null;
        companyEmail = cInfo.CompanyInfo?.Email?.Address || null;
      }

      const db = getDb();
      // Check if connection already exists for this realm
      const existing = await db
        .select()
        .from(qboConnections)
        .where(eq(qboConnections.realmId, input.realmId))
        .limit(1);

      if (existing[0]) {
        // Update existing
        await db.update(qboConnections)
          .set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
            companyName: companyName || existing[0].companyName,
            companyEmail: companyEmail || existing[0].companyEmail,
            accountType: accountType as "ca_clients" | "us_clients" | "personal_business",
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(qboConnections.id, existing[0].id));

        return {
          success: true,
          realmId: input.realmId,
          companyName,
          accountType,
          updated: true,
        };
      }

      await db.insert(qboConnections).values({
        userId: 1,
        realmId: input.realmId,
        companyName,
        companyEmail,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
        environment: env as "sandbox" | "production",
        accountType: accountType as "ca_clients" | "us_clients" | "personal_business",
        isActive: true,
      });

      return {
        success: true,
        realmId: input.realmId,
        companyName,
        accountType,
        updated: false,
      };
    }),

  // --- Connection Management ---

  listConnections: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(qboConnections).orderBy(desc(qboConnections.createdAt));
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

  // --- Webhook Receiver ---

  webhook: publicQuery
    .input(z.object({
      realmId: z.string(),
      eventNotifications: z.array(z.object({
        dataChangeEvent: z.object({
          entities: z.array(z.object({
            name: z.string(),
            id: z.string(),
            operation: z.string(),
          })),
        }),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const conn = await db.select().from(qboConnections).where(eq(qboConnections.realmId, input.realmId)).limit(1);
      if (!conn[0]) return { received: true, action: "connection_not_found" };

      for (const notification of input.eventNotifications) {
        for (const entity of notification.dataChangeEvent.entities) {
          if (entity.name === "Customer") {
            await doSyncCustomers(conn[0].id);
          } else if (entity.name === "Invoice") {
            await doSyncInvoices(conn[0].id);
          } else if (entity.name === "Payment") {
            await doSyncPayments(conn[0].id);
          }
        }
      }

      return { received: true, action: "synced" };
    }),
});
