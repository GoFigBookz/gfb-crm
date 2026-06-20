import { z } from "zod";
import { createRouter, staffQuery, seniorQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { employees } from "../db/schema";
import { eq } from "drizzle-orm";

export const employeeRouter = createRouter({
  list: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(employees).where(eq(employees.clientId, input.clientId)).orderBy(employees.lastName);
    }),

  get: staffQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const row = await db.select().from(employees).where(eq(employees.id, input.id)).limit(1);
      return row[0] || null;
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
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(employees).values({ ...input, createdAt: new Date(), updatedAt: new Date() });
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
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const db = getDb();
      await db.update(employees).set({ ...data, updatedAt: new Date() }).where(eq(employees.id, id));
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
