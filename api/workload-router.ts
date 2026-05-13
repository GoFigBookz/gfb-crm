import { z } from "zod";
import { createRouter, seniorQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users, tasks, timeEntries, clients } from "../db/schema";
import { eq, and, gte, lte, count, sql, desc } from "drizzle-orm";

export const workloadRouter = createRouter({
  // Get workload for all staff (or specific user)
  getStaffWorkload: seniorQuery
    .input(z.object({ userId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();

      // Get all staff users (junior_bookkeeper, senior_bookkeeper, admin)
      const staffUsers = await db
        .select()
        .from(users)
        .where(
          sql`${users.role} IN ('admin', 'senior_bookkeeper', 'junior_bookkeeper')`
        )
        .orderBy(desc(users.createdAt));

      const now = new Date();
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 6, 23, 59, 59);

      const result = await Promise.all(
        staffUsers.map(async (user) => {
          // Count open tasks
          const openTasks = await db
            .select()
            .from(tasks)
            .where(and(eq(tasks.assignedTo, user.name || user.email), eq(tasks.completed, false)));

          // Count overdue tasks
          const overdueTasks = openTasks.filter(
            (t) => t.dueDate && new Date(t.dueDate) < now
          );

          // Hours this week
          const weekEntries = await db
            .select()
            .from(timeEntries)
            .where(
              and(
                eq(timeEntries.userId, user.id),
                gte(timeEntries.date, startOfWeek),
                lte(timeEntries.date, endOfWeek)
              )
            );
          const weekHours = weekEntries.reduce((sum, e) => sum + (e.hours || 0), 0);

          // Clients assigned to this user
          const assignedClients = await db
            .select()
            .from(clients)
            .where(eq(clients.assignedTo, user.name || user.email));

          // Capacity color
          const totalOpen = openTasks.length;
          let capacityColor: "green" | "yellow" | "red" = "green";
          if (totalOpen > 30) capacityColor = "red";
          else if (totalOpen > 15) capacityColor = "yellow";

          return {
            userId: user.id,
            name: user.name || user.email,
            email: user.email,
            role: user.role,
            openTasks: totalOpen,
            overdueTasks: overdueTasks.length,
            weekHours: Math.round(weekHours * 10) / 10,
            assignedClients: assignedClients.length,
            capacityColor,
          };
        })
      );

      return result;
    }),
});
