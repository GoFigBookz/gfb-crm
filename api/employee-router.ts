import { z } from "zod";
import { createRouter, staffQuery, seniorQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { employees } from "../db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret, checkRevealCode } from "./sensitive";

/** Never leak the stored (encrypted) SIN. Return a hasSin flag instead. */
function stripSin<T extends { sin?: string | null }>(row: T): T & { hasSin: boolean } {
  const { sin, ...rest } = row as any;
  return { ...rest, hasSin: !!sin };
}

export const employeeRouter = createRouter({
  list: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(employees).where(eq(employees.clientId, input.clientId)).orderBy(employees.lastName);
      return (rows as any[]).map(stripSin);
    }),

  get: staffQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const row = await db.select().from(employees).where(eq(employees.id, input.id)).limit(1);
      return row[0] ? stripSin(row[0] as any) : null;
    }),

  // Code-gated SIN reveal (for printing T4/T4A). Requires FIGGY_SIN_PIN.
  revealSin: staffQuery
    .input(z.object({ id: z.number(), code: z.string() }))
    .mutation(async ({ input }) => {
      const gate = checkRevealCode(input.code);
      if (!gate.ok) return { ok: false as const, reason: gate.reason };
      const db = getDb();
      const row = (await db.select().from(employees).where(eq(employees.id, input.id)).limit(1))[0] as any;
      return { ok: true as const, sin: row?.sin ? decryptSecret(row.sin) : null };
    }),

  create: seniorQuery
    .input(z.object({
      clientId: z.number(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      dateOfBirth: z.date().optional(),
      hireDate: z.date().optional(),
      startDate: z.date().optional(),
      payType: z.enum(["salary", "hourly", "commission", "contract"]).optional(),
      annualSalary: z.number().optional(),
      hourlyRate: z.number().optional(),
      hoursPerWeek: z.number().optional(),
      position: z.string().optional(),
      department: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      isContractor: z.boolean().optional(),
      contractUrl: z.string().optional(),
      phoneAllowance: z.number().nullable().optional(),
      reimbursementAmount: z.number().nullable().optional(),
      reimbursementNote: z.string().optional(),
      getsRevenueShare: z.boolean().optional(),
      revenueSharePercent: z.number().nullable().optional(),
      getsBonus: z.boolean().optional(),
      getsDividends: z.boolean().optional(),
      getsPhoneAllowance: z.boolean().optional(),
      getsReimbursement: z.boolean().optional(),
      ytdGrossOpening: z.number().nullable().optional(),
      sin: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { sin, ...rest } = input;
      const values: any = { ...rest, createdAt: new Date(), updatedAt: new Date() };
      if (sin !== undefined) values.sin = sin ? encryptSecret(sin) : null; // encrypted at rest
      const result = await db.insert(employees).values(values);
      return { success: true, id: Number(result.lastInsertRowid) };
    }),

  update: seniorQuery
    .input(z.object({
      id: z.number(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      dateOfBirth: z.date().optional(),
      hireDate: z.date().optional(),
      startDate: z.date().optional(),
      payType: z.enum(["salary", "hourly", "commission", "contract"]).optional(),
      annualSalary: z.number().optional(),
      hourlyRate: z.number().optional(),
      hoursPerWeek: z.number().optional(),
      position: z.string().optional(),
      department: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      isContractor: z.boolean().optional(),
      isActive: z.boolean().optional(),
      terminationDate: z.date().optional(),
      terminationReason: z.string().optional(),
      hasHealthBenefits: z.boolean().optional(),
      hasDentalBenefits: z.boolean().optional(),
      hasRrsp: z.boolean().optional(),
      rrspMatchPercent: z.number().optional(),
      onGovernmentGrant: z.boolean().optional(),
      grantType: z.string().optional(),
      grantStartDate: z.date().optional(),
      grantEndDate: z.date().optional(),
      contractUrl: z.string().optional(),
      phoneAllowance: z.number().nullable().optional(),
      reimbursementAmount: z.number().nullable().optional(),
      reimbursementNote: z.string().optional(),
      getsRevenueShare: z.boolean().optional(),
      revenueSharePercent: z.number().nullable().optional(),
      getsBonus: z.boolean().optional(),
      getsDividends: z.boolean().optional(),
      getsPhoneAllowance: z.boolean().optional(),
      getsReimbursement: z.boolean().optional(),
      ytdGrossOpening: z.number().nullable().optional(),
      sin: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, sin, ...data } = input;
      const db = getDb();
      const patch: any = { ...data, updatedAt: new Date() };
      if (sin !== undefined) patch.sin = sin ? encryptSecret(sin) : null; // encrypted at rest
      await db.update(employees).set(patch).where(eq(employees.id, id));
      return { success: true };
    }),

  delete: seniorQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(employees).where(eq(employees.id, input.id));
      return { success: true };
    }),
});
