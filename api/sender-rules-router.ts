import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { senderRules, clients } from "../db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";

/**
 * EMAIL SENDER RULES ROUTER
 * 
 * Defines which "from" address to use when emailing each client.
 * 
 * Rules evaluated in priority order (highest first):
 * 1. Exact client match (clientId)
 * 2. Domain match (clientEmailDomain)
 * 3. Name pattern match (clientNamePattern)
 * 4. Default rule (clientId IS NULL)
 * 
 * Pre-configured for GFB:
 * - John's company → finance@adbank.network
 * - Dark Horse → markie@darkhorseinc.com  
 * - Everyone else → markie@gofig.ca
 */

export const senderRulesRouter = createRouter({
  // List all rules
  list: staffQuery.query(async () => {
    const db = getDb();
    return db.select().from(senderRules).orderBy(desc(senderRules.priority), desc(senderRules.createdAt));
  }),

  // Get the correct sender for a specific client
  getForClient: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      
      // Get client details
      const clientRows = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
      const client = clientRows[0];
      if (!client) throw new Error("Client not found");

      // Get all active rules, highest priority first
      const allRules = await db
        .select()
        .from(senderRules)
        .where(eq(senderRules.isActive, true))
        .orderBy(desc(senderRules.priority));

      // Evaluate rules in order
      for (const rule of allRules) {
        // Exact client match
        if (rule.clientId === input.clientId) {
          return { rule, matchedBy: "client_id", client };
        }
        // Domain match
        if (rule.clientEmailDomain && client.email?.toLowerCase().includes(rule.clientEmailDomain.toLowerCase())) {
          return { rule, matchedBy: "domain", client };
        }
        // Name pattern match
        if (rule.clientNamePattern && client.name?.toLowerCase().includes(rule.clientNamePattern.toLowerCase())) {
          return { rule, matchedBy: "name_pattern", client };
        }
        // Default rule (no clientId, no domain, no pattern)
        if (!rule.clientId && !rule.clientEmailDomain && !rule.clientNamePattern) {
          return { rule, matchedBy: "default", client };
        }
      }

      // Fallback — no rules matched
      return {
        rule: {
          fromAddress: "markie@gofig.ca",
          fromName: "Go Fig Bookz",
          replyTo: null,
        },
        matchedBy: "fallback",
        client,
      };
    }),

  // Create a rule
  create: staffQuery
    .input(z.object({
      clientId: z.number().optional(),
      fromAddress: z.string().email(),
      fromName: z.string().min(1),
      replyTo: z.string().email().optional(),
      isDefault: z.boolean().default(false),
      clientEmailDomain: z.string().optional(),
      clientNamePattern: z.string().optional(),
      priority: z.number().default(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [rule] = await db.insert(senderRules).values({
        ...input,
        isActive: true,
      }).returning();
      return rule;
    }),

  // Update a rule
  update: staffQuery
    .input(z.object({
      id: z.number(),
      fromAddress: z.string().email().optional(),
      fromName: z.string().min(1).optional(),
      replyTo: z.string().email().optional().nullable(),
      isDefault: z.boolean().optional(),
      clientEmailDomain: z.string().optional().nullable(),
      clientNamePattern: z.string().optional().nullable(),
      priority: z.number().optional(),
      notes: z.string().optional().nullable(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(senderRules)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(senderRules.id, id));
      return { success: true };
    }),

  // Delete a rule
  delete: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(senderRules).where(eq(senderRules.id, input.id));
      return { success: true };
    }),

  // Seed default GFB rules
  seedDefaults: staffQuery.mutation(async () => {
    const db = getDb();
    
    const defaults = [
      {
        clientId: null,
        fromAddress: "markie@gofig.ca",
        fromName: "Go Fig Bookz",
        isDefault: true,
        priority: 0,
        notes: "Default sender for all non-matched clients",
      },
      {
        clientId: null,
        fromAddress: "finance@adbank.network",
        fromName: "Adbank Finance",
        clientNamePattern: "John",
        priority: 10,
        notes: "John's company (matched by name containing 'John')",
      },
      {
        clientId: null,
        fromAddress: "markie@darkhorseinc.com",
        fromName: "Dark Horse Inc.",
        clientEmailDomain: "darkhorseinc.com",
        priority: 10,
        notes: "Dark Horse clients (matched by email domain)",
      },
    ];

    const inserted = [];
    for (const def of defaults) {
      // Check if rule already exists
      const existing = await db
        .select()
        .from(senderRules)
        .where(
          and(
            eq(senderRules.fromAddress, def.fromAddress),
            isNull(senderRules.clientId)
          )
        )
        .limit(1);

      if (!existing[0]) {
        const [r] = await db.insert(senderRules).values(def).returning();
        inserted.push(r);
      }
    }

    return { seeded: inserted.length, rules: inserted };
  }),
});
