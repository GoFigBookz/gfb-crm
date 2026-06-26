import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { connectedAccounts, connectorStatements, connectorSyncLogs, clients } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./qbo-oauth";

/**
 * PER-CLIENT CONNECTOR ROUTER
 *
 * Real API sync for per-client integrations:
 * - Wise (bank statements, transactions)
 * - Stripe (payments, invoices, customers, payouts)
 * - Jobber (invoices, quotes, visits)
 * - TouchBistro (sales, labor, menu)
 * - PayPal (payments, transactions, statements)
 *
 * Each connection is tied to a specific client.
 * The CRM pulls statements monthly via cron or manual trigger.
 */

const PER_CLIENT_PROVIDERS = [
  "wise",
  "stripe",
  "jobber",
  "touchbistro",
  "paypal",
  "square",
  "dropbox",
] as const;

type PerClientProvider = (typeof PER_CLIENT_PROVIDERS)[number];

// Provider configs
const PROVIDER_CONFIGS: Record<
  PerClientProvider,
  { name: string; baseUrl: string }
> = {
  wise: { name: "Wise", baseUrl: "https://api.wise.com" },
  stripe: { name: "Stripe", baseUrl: "https://api.stripe.com" },
  jobber: { name: "Jobber", baseUrl: "https://api.getjobber.com" },
  touchbistro: { name: "TouchBistro", baseUrl: "https://api.touchbistro.com" },
  paypal: { name: "PayPal", baseUrl: "https://api.paypal.com" },
  square: { name: "Square", baseUrl: "https://connect.squareup.com" },
  dropbox: { name: "Dropbox", baseUrl: "https://api.dropboxapi.com" },
};

// ======== SYNC ENGINE ========

interface SyncParams {
  provider: PerClientProvider;
  apiKey: string;
  clientId: number;
  userId: number;
  periodStart: Date;
  periodEnd: Date;
  year: number;
  month: number;
  connectedAccountId: number;
}

interface SyncResult {
  status: "success" | "error" | "partial";
  recordsSynced: number;
  errorMessage?: string;
}

async function syncProviderData(params: SyncParams): Promise<SyncResult> {
  switch (params.provider) {
    case "wise":
      return syncWise(params);
    case "stripe":
      return syncStripe(params);
    case "jobber":
      return syncJobber(params);
    case "touchbistro":
      return syncTouchBistro(params);
    case "paypal":
      return syncPayPal(params);
    case "square":
      return syncSquare(params);
    case "dropbox":
      // Dropbox is file storage, not a statement source — the connection is stored
      // per client for document access; there are no monthly statements to pull.
      return { status: "success", recordsSynced: 0 };
    default:
      return {
        status: "error",
        recordsSynced: 0,
        errorMessage: `Unknown provider: ${params.provider}`,
      };
  }
}

async function upsertStatement(
  db: ReturnType<typeof getDb>,
  params: SyncParams,
  data: {
    totalRevenue: number;
    totalExpenses: number;
    totalFees: number;
    netAmount: number;
    transactionCount: number;
    transactionsJson: string;
    rawJson: string;
  }
) {
  const existing = await db
    .select()
    .from(connectorStatements)
    .where(
      and(
        eq(connectorStatements.connectedAccountId, params.connectedAccountId),
        eq(connectorStatements.year, params.year),
        eq(connectorStatements.month, params.month)
      )
    )
    .get();

  const statementData = {
    clientId: params.clientId,
    userId: params.userId,
    connectedAccountId: params.connectedAccountId,
    provider: params.provider,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    year: params.year,
    month: params.month,
    ...data,
    status: "synced" as const,
  };

  if (existing) {
    await db
      .update(connectorStatements)
      .set({ ...statementData, updatedAt: new Date() })
      .where(eq(connectorStatements.id, existing.id));
  } else {
    await db.insert(connectorStatements).values(statementData);
  }
}

// ---- WISE ----
async function syncWise(params: SyncParams): Promise<SyncResult> {
  try {
    const profilesRes = await fetch("https://api.wise.com/v1/profiles", {
      headers: { Authorization: `Bearer ${params.apiKey}` },
    });

    if (!profilesRes.ok) {
      return {
        status: "error",
        recordsSynced: 0,
        errorMessage: `Wise API error: ${profilesRes.status}`,
      };
    }

    const profiles = await profilesRes.json();
    let allTransactions: any[] = [];

    for (const profile of profiles) {
      const txRes = await fetch(
        `https://api.wise.com/v1/profiles/${profile.id}/transactions?intervalStart=${params.periodStart.toISOString()}&intervalEnd=${params.periodEnd.toISOString()}`,
        { headers: { Authorization: `Bearer ${params.apiKey}` } }
      );
      if (txRes.ok) {
        const txs = await txRes.json();
        allTransactions = allTransactions.concat(txs || []);
      }
    }

    const totalRevenue = allTransactions
      .filter((t: any) => t.type === "CREDIT" || t.type === "INCOMING")
      .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
    const totalExpenses = allTransactions
      .filter((t: any) => t.type === "DEBIT" || t.type === "OUTGOING")
      .reduce((sum: number, t: any) => sum + Math.abs(t.amount || 0), 0);
    const totalFees = allTransactions.reduce(
      (sum: number, t: any) => sum + (t.feeAmount || 0),
      0
    );

    await upsertStatement(getDb(), params, {
      totalRevenue,
      totalExpenses,
      totalFees,
      netAmount: totalRevenue - totalExpenses - totalFees,
      transactionCount: allTransactions.length,
      transactionsJson: JSON.stringify(allTransactions.slice(0, 500)),
      rawJson: JSON.stringify({
        profiles: profiles.length,
        transactionCount: allTransactions.length,
      }),
    });

    return { status: "success", recordsSynced: allTransactions.length };
  } catch (error) {
    return {
      status: "error",
      recordsSynced: 0,
      errorMessage: error instanceof Error ? error.message : "Wise sync failed",
    };
  }
}

// ---- STRIPE ----
async function syncStripe(params: SyncParams): Promise<SyncResult> {
  try {
    const start = Math.floor(params.periodStart.getTime() / 1000);
    const end = Math.floor(params.periodEnd.getTime() / 1000);

    const balanceRes = await fetch(
      `https://api.stripe.com/v1/balance_transactions?created[gte]=${start}&created[lte]=${end}&limit=100`,
      { headers: { Authorization: `Bearer ${params.apiKey}` } }
    );

    if (!balanceRes.ok) {
      return {
        status: "error",
        recordsSynced: 0,
        errorMessage: `Stripe API error: ${balanceRes.status}`,
      };
    }

    const balanceData = await balanceRes.json();
    const transactions = balanceData.data || [];

    const payoutsRes = await fetch(
      `https://api.stripe.com/v1/payouts?created[gte]=${start}&created[lte]=${end}&limit=100`,
      { headers: { Authorization: `Bearer ${params.apiKey}` } }
    );
    const payoutsData = payoutsRes.ok ? await payoutsRes.json() : { data: [] };

    const totalRevenue = transactions
      .filter((t: any) => t.type === "charge" || t.type === "payment")
      .reduce((sum: number, t: any) => sum + (t.amount || 0) / 100, 0);
    const totalFees = transactions.reduce(
      (sum: number, t: any) => sum + (t.fee || 0) / 100,
      0
    );
    const totalPayouts = payoutsData.data.reduce(
      (sum: number, t: any) => sum + (t.amount || 0) / 100,
      0
    );

    await upsertStatement(getDb(), params, {
      totalRevenue,
      totalExpenses: totalPayouts,
      totalFees,
      netAmount: totalRevenue - totalFees,
      transactionCount: transactions.length,
      transactionsJson: JSON.stringify(transactions.slice(0, 500)),
      rawJson: JSON.stringify({
        balanceTransactions: transactions.length,
        payouts: payoutsData.data.length,
      }),
    });

    return { status: "success", recordsSynced: transactions.length };
  } catch (error) {
    return {
      status: "error",
      recordsSynced: 0,
      errorMessage: error instanceof Error ? error.message : "Stripe sync failed",
    };
  }
}

// ---- SQUARE ----
// Square POS: pull COMPLETED payments for the period (amounts are in cents).
// Revenue = sum(amount_money); fees = sum(processing_fee). Paginates by cursor.
async function syncSquare(params: SyncParams): Promise<SyncResult> {
  try {
    const beginTime = params.periodStart.toISOString();
    const endTime = params.periodEnd.toISOString();
    let cursor: string | undefined;
    let payments: any[] = [];

    // Bounded loop so a busy month can't run away (≈ up to 1000 payments).
    for (let page = 0; page < 10; page++) {
      const url = new URL(`${PROVIDER_CONFIGS.square.baseUrl}/v2/payments`);
      url.searchParams.set("begin_time", beginTime);
      url.searchParams.set("end_time", endTime);
      url.searchParams.set("sort_order", "ASC");
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Square-Version": "2024-12-18",
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        return { status: "error", recordsSynced: 0, errorMessage: `Square API error: ${res.status}` };
      }
      const data = await res.json();
      payments = payments.concat(data.payments || []);
      cursor = data.cursor;
      if (!cursor) break;
    }

    // Only completed payments count as sales; amounts are integer cents.
    const completed = payments.filter((p: any) => (p.status ?? "COMPLETED") === "COMPLETED");
    const totalRevenue = completed.reduce((sum: number, p: any) => sum + (p.amount_money?.amount || 0) / 100, 0);
    const totalFees = completed.reduce(
      (sum: number, p: any) =>
        sum + (p.processing_fee || []).reduce((f: number, pf: any) => f + (pf.amount_money?.amount || 0) / 100, 0),
      0,
    );

    await upsertStatement(getDb(), params, {
      totalRevenue,
      totalExpenses: 0,
      totalFees,
      netAmount: totalRevenue - totalFees,
      transactionCount: completed.length,
      transactionsJson: JSON.stringify(completed.slice(0, 500)),
      rawJson: JSON.stringify({ payments: payments.length, completed: completed.length }),
    });

    return { status: "success", recordsSynced: completed.length };
  } catch (error) {
    return {
      status: "error",
      recordsSynced: 0,
      errorMessage: error instanceof Error ? error.message : "Square sync failed",
    };
  }
}

// ---- JOBBER ----
async function syncJobber(params: SyncParams): Promise<SyncResult> {
  try {
    const query = `
      query GetInvoices($after: String) {
        invoices(first: 100, after: $after) {
          edges { node { id invoiceNumber total status createdAt client { id name } } }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;

    const res = await fetch("https://api.getjobber.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      return {
        status: "error",
        recordsSynced: 0,
        errorMessage: `Jobber API error: ${res.status}`,
      };
    }

    const data = await res.json();
    const invoices =
      data?.data?.invoices?.edges?.map((e: any) => e.node) || [];

    const periodInvoices = invoices.filter((inv: any) => {
      const date = new Date(inv.createdAt);
      return date >= params.periodStart && date <= params.periodEnd;
    });

    const totalRevenue = periodInvoices
      .filter((inv: any) => inv.status === "PAID" || inv.status === "sent")
      .reduce((sum: number, inv: any) => sum + (inv.total || 0), 0);

    await upsertStatement(getDb(), params, {
      totalRevenue,
      totalExpenses: 0,
      totalFees: 0,
      netAmount: totalRevenue,
      transactionCount: periodInvoices.length,
      transactionsJson: JSON.stringify(periodInvoices.slice(0, 500)),
      rawJson: JSON.stringify({
        totalInvoices: invoices.length,
        periodInvoices: periodInvoices.length,
      }),
    });

    return { status: "success", recordsSynced: periodInvoices.length };
  } catch (error) {
    return {
      status: "error",
      recordsSynced: 0,
      errorMessage: error instanceof Error ? error.message : "Jobber sync failed",
    };
  }
}

// ---- TOUCHBISTRO ----
async function syncTouchBistro(_params: SyncParams): Promise<SyncResult> {
  // TouchBistro has no confirmed public sales API for this use case (their data is
  // typically accessed via TouchBistro Cloud reporting/export or a partner program,
  // not a bearer-token REST endpoint). Rather than call an unverified endpoint and
  // fail cryptically, return a clear next step. Revisit once Markie confirms how
  // their TouchBistro sales data is actually accessible.
  return {
    status: "error",
    recordsSynced: 0,
    errorMessage:
      "TouchBistro auto-pull isn't wired yet — confirm the data path (TouchBistro Cloud export vs. partner API). For now, export the monthly sales report and enter it as the client's monthly sales receipt, or run it through Bank → QBO.",
  };
}

// ---- PAYPAL ----
/** PayPal uses OAuth2 client-credentials. The user pastes "ClientID:Secret"; we
 *  exchange it for a short-lived access token. (If they paste a bare token, use it.) */
async function paypalAccessToken(apiKey: string): Promise<string> {
  if (!apiKey.includes(":")) return apiKey.trim(); // already an access token
  const [clientId, secret] = apiKey.split(":").map((s) => s.trim());
  const basic = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`PayPal auth failed (${res.status}). Paste the app's "Client ID:Secret" (with a colon between).`);
  }
  return data.access_token as string;
}

async function syncPayPal(params: SyncParams): Promise<SyncResult> {
  try {
    const startDate = params.periodStart.toISOString();
    const endDate = params.periodEnd.toISOString();

    // Exchange Client ID:Secret → access token (PayPal OAuth2 client-credentials).
    const token = await paypalAccessToken(params.apiKey);

    const res = await fetch(
      `https://api-m.paypal.com/v1/reporting/transactions?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&fields=all&page_size=500`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        status: "error",
        recordsSynced: 0,
        errorMessage: `PayPal API error: ${res.status}. ${body.slice(0, 160)}`,
      };
    }

    const data = await res.json();
    const transactions = data.transaction_details || [];

    const totalRevenue = transactions
      .filter((t: any) => t.transaction_info?.transaction_amount?.value > 0)
      .reduce(
        (sum: number, t: any) =>
          sum + parseFloat(t.transaction_info.transaction_amount.value || 0),
        0
      );
    const totalFees = transactions.reduce(
      (sum: number, t: any) =>
        sum + parseFloat(t.transaction_info?.fee_amount?.value || 0),
      0
    );

    await upsertStatement(getDb(), params, {
      totalRevenue,
      totalExpenses: 0,
      totalFees,
      netAmount: totalRevenue - totalFees,
      transactionCount: transactions.length,
      transactionsJson: JSON.stringify(transactions.slice(0, 500)),
      rawJson: JSON.stringify({ transactionCount: transactions.length }),
    });

    return { status: "success", recordsSynced: transactions.length };
  } catch (error) {
    return {
      status: "error",
      recordsSynced: 0,
      errorMessage: error instanceof Error ? error.message : "PayPal sync failed",
    };
  }
}

// ======== ROUTER ========

export const connectorRouter = createRouter({
  // List all per-client connections
  list: staffQuery
    .input(
      z
        .object({
          provider: z.enum(PER_CLIENT_PROVIDERS).optional(),
          clientId: z.number().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [eq(connectedAccounts.userId, ctx.user.id)];

      if (input?.provider) {
        conditions.push(eq(connectedAccounts.provider, input.provider));
      }
      if (input?.clientId) {
        conditions.push(eq(connectedAccounts.clientId, input.clientId));
      }

      const all = await db
        .select()
        .from(connectedAccounts)
        .where(and(...conditions))
        .orderBy(desc(connectedAccounts.createdAt));

      return all.filter((a) =>
        PER_CLIENT_PROVIDERS.includes(
          a.provider as (typeof PER_CLIENT_PROVIDERS)[number]
        )
      );
    }),

  // Get single connection
  get: staffQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.id, input.id),
            eq(connectedAccounts.userId, ctx.user.id)
          )
        )
        .limit(1);
      return rows[0] || null;
    }),

  // Create per-client API key connection
  create: staffQuery
    .input(
      z.object({
        clientId: z.number(),
        provider: z.enum(PER_CLIENT_PROVIDERS),
        accountLabel: z.string().min(1),
        apiKey: z.string().min(1),
        apiSecret: z.string().optional(),
        accountEmail: z.string().optional(),
        scopes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { clientId, provider, accountLabel, apiKey, apiSecret, accountEmail, scopes } =
        input;

      // Verify client belongs to user
      const client = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.userId, ctx.user.id)))
        .get();
      if (!client) throw new Error("Client not found");

      // Check if already exists
      const existing = await db
        .select()
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.userId, ctx.user.id),
            eq(connectedAccounts.clientId, clientId),
            eq(connectedAccounts.provider, provider)
          )
        )
        .limit(1);

      if (existing[0]) {
        await db
          .update(connectedAccounts)
          .set({
            accountLabel,
            accessToken: encryptSecret(apiKey),         // encrypted at rest (AES-256-GCM)
            refreshToken: encryptSecret(apiSecret),     // null when absent
            accountEmail: accountEmail || null,
            scopes: scopes || null,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(connectedAccounts.id, existing[0].id));
        return { success: true, updated: true, id: existing[0].id };
      }

      const [account] = await db
        .insert(connectedAccounts)
        .values({
          userId: ctx.user.id,
          clientId,
          provider,
          providerAccountId: accountEmail || `${provider}_${clientId}`,
          accountLabel,
          accountEmail: accountEmail || null,
          accessToken: encryptSecret(apiKey),         // encrypted at rest (AES-256-GCM)
          refreshToken: encryptSecret(apiSecret),     // null when absent
          scopes: scopes || null,
          isActive: true,
        })
        .returning();

      return { success: true, updated: false, id: account.id };
    }),

  // Update connection
  update: staffQuery
    .input(
      z.object({
        id: z.number(),
        accountLabel: z.string().min(1).optional(),
        apiKey: z.string().min(1).optional(),
        apiSecret: z.string().optional(),
        accountEmail: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...data } = input;

      const updateData: Record<string, unknown> = {};
      if (data.accountLabel !== undefined) updateData.accountLabel = data.accountLabel;
      if (data.apiKey !== undefined) updateData.accessToken = encryptSecret(data.apiKey);
      if (data.apiSecret !== undefined) updateData.refreshToken = encryptSecret(data.apiSecret);
      if (data.accountEmail !== undefined) updateData.accountEmail = data.accountEmail;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      updateData.updatedAt = new Date();

      await db
        .update(connectedAccounts)
        .set(updateData)
        .where(
          and(
            eq(connectedAccounts.id, id),
            eq(connectedAccounts.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  // Delete connection
  delete: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.id, input.id),
            eq(connectedAccounts.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),

  // Toggle active
  toggle: staffQuery
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(connectedAccounts)
        .set({ isActive: input.active, updatedAt: new Date() })
        .where(
          and(
            eq(connectedAccounts.id, input.id),
            eq(connectedAccounts.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),

  // ======== REAL SYNC: pullStatements ========
  pullStatements: staffQuery
    .input(
      z.object({
        connectionId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Get connection
      const rows = await db
        .select()
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.id, input.connectionId),
            eq(connectedAccounts.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!rows[0]) throw new Error("Connection not found");
      const conn = rows[0];

      if (!conn.clientId || !conn.accessToken) {
        throw new Error("Connection missing client or API key");
      }

      const provider = conn.provider as PerClientProvider;

      // Determine period
      const now = new Date();
      let periodStart: Date;
      let periodEnd: Date;
      let year: number;
      let month: number;

      if (input.startDate && input.endDate) {
        periodStart = new Date(input.startDate);
        periodEnd = new Date(input.endDate);
        year = periodStart.getFullYear();
        month = periodStart.getMonth() + 1;
      } else {
        year = now.getFullYear();
        month = now.getMonth() + 1;
        periodStart = new Date(year, month - 1, 1);
        periodEnd = new Date(year, month, 0, 23, 59, 59);
      }

      // Start sync log
      const logResult = await db
        .insert(connectorSyncLogs)
        .values({
          connectedAccountId: conn.id,
          clientId: conn.clientId,
          provider,
          syncType: "all",
          status: "success", // will be updated
          recordsSynced: 0,
          startedAt: new Date(),
        })
        .returning();
      const syncLogId = logResult[0].id;

      try {
        // Run sync
        const result = await syncProviderData({
          provider,
          apiKey: decryptSecret(conn.accessToken) || "",   // decrypt at point of use (legacy plaintext passes through)
          clientId: conn.clientId,
          userId: ctx.user.id,
          periodStart,
          periodEnd,
          year,
          month,
          connectedAccountId: conn.id,
        });

        // Update sync log
        await db
          .update(connectorSyncLogs)
          .set({
            status: result.status,
            recordsSynced: result.recordsSynced,
            errorMessage: result.errorMessage,
            completedAt: new Date(),
          })
          .where(eq(connectorSyncLogs.id, syncLogId));

        // Update connection last synced
        await db
          .update(connectedAccounts)
          .set({ lastSyncedAt: new Date() })
          .where(eq(connectedAccounts.id, conn.id));

        return {
          success: result.status === "success" || result.status === "partial",
          provider: conn.provider,
          clientId: conn.clientId,
          pulled: PROVIDER_CONFIGS[provider].name,
          recordsSynced: result.recordsSynced,
          startDate: periodStart.toISOString(),
          endDate: periodEnd.toISOString(),
          message: result.errorMessage || `${result.recordsSynced} records synced`,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        await db
          .update(connectorSyncLogs)
          .set({
            status: "error",
            errorMessage,
            completedAt: new Date(),
          })
          .where(eq(connectorSyncLogs.id, syncLogId));

        throw new Error(`Sync failed: ${errorMessage}`);
      }
    }),

  // Get statements for a client/provider
  getStatements: staffQuery
    .input(
      z.object({
        clientId: z.number(),
        provider: z.enum(PER_CLIENT_PROVIDERS).optional(),
        year: z.number().optional(),
        month: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [
        eq(connectorStatements.clientId, input.clientId),
        eq(connectorStatements.userId, ctx.user.id),
      ];
      if (input.provider)
        conditions.push(eq(connectorStatements.provider, input.provider));
      if (input.year) conditions.push(eq(connectorStatements.year, input.year));
      if (input.month)
        conditions.push(eq(connectorStatements.month, input.month));

      return db
        .select()
        .from(connectorStatements)
        .where(and(...conditions))
        .orderBy(desc(connectorStatements.periodEnd));
    }),

  // Get sync logs
  getSyncLogs: staffQuery
    .input(
      z.object({
        connectedAccountId: z.number(),
        limit: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select()
        .from(connectorSyncLogs)
        .where(eq(connectorSyncLogs.connectedAccountId, input.connectedAccountId))
        .orderBy(desc(connectorSyncLogs.startedAt))
        .limit(input.limit);
    }),

  // Get clients missing a specific connector
  missingConnections: staffQuery
    .input(z.object({ provider: z.enum(PER_CLIENT_PROVIDERS) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const allClients = await db
        .select({ id: connectedAccounts.clientId })
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.userId, ctx.user.id),
            eq(connectedAccounts.provider, input.provider)
          )
        );
      const connectedClientIds = new Set(
        allClients.map((c) => c.id).filter(Boolean)
      );
      return {
        provider: input.provider,
        connectedCount: connectedClientIds.size,
        message: `${connectedClientIds.size} clients connected to ${input.provider}`,
      };
    }),
});
