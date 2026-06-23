import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tasks, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { checkSecret } from "./lib/admin-auth";

/**
 * VOICE WEBHOOK ROUTER
 * For external voice assistants (Gemini, Siri, Google Assistant)
 * to create tasks via webhooks without full OAuth flow.
 * 
 * Auth: X-Voice-Token header (set in .env as VOICE_WEBHOOK_TOKEN)
 */

function validateVoiceToken(token: string): boolean {
  return checkSecret(token, "VOICE_WEBHOOK_TOKEN");
}

export const voiceRouter = createRouter({
  // Voice task creation
  // POST /api/trpc/voice.createTask
  // Headers: X-Voice-Token: <token>
  // Body: { text: "Call John about QBO tomorrow", userEmail: "markie@gofig.ca" }
  createTask: publicQuery
    .input(z.object({
      text: z.string().min(1).max(500),
      userEmail: z.string().email().optional().default("markie@gofig.ca"),
    }))
    .mutation(async ({ ctx, input }) => {
      const token = (ctx as any).req?.headers?.["x-voice-token"] || "";
      if (!validateVoiceToken(token)) {
        throw new Error("Invalid voice token");
      }

      const db = getDb();
      const text = input.text.toLowerCase();
      
      // Find user
      const userRows = await db.select().from(users).where(eq(users.email, input.userEmail)).limit(1);
      const user = userRows[0];
      if (!user) {
        throw new Error("User not found");
      }
      
      // Parse natural language
      let title = input.text;
      let dueDate: Date | undefined = undefined;
      let priority: "low" | "medium" | "high" = "medium";
      
      const tomorrowMatch = text.match(/tomorrow|next day/);
      const todayMatch = text.match(/today|this afternoon|tonight/);
      const nextWeekMatch = text.match(/next week|monday|tuesday|wednesday|thursday|friday/);
      const urgentMatch = text.match(/urgent|asap|important|critical/);
      
      if (urgentMatch) priority = "high";
      
      const now = new Date();
      if (tomorrowMatch) {
        dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        title = title.replace(/tomorrow|next day/gi, "").trim();
      } else if (todayMatch) {
        dueDate = now;
        title = title.replace(/today|this afternoon|tonight/gi, "").trim();
      } else if (nextWeekMatch) {
        dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        title = title.replace(/next week|monday|tuesday|wednesday|thursday|friday/gi, "").trim();
      }
      
      // Clean up title
      title = title.replace(/^add\s+/i, "").replace(/^create\s+/i, "").replace(/^task\s+/i, "").trim();
      if (title.endsWith(".")) title = title.slice(0, -1);
      if (!title) title = input.text;
      
      const [task] = await db.insert(tasks).values({
        userId: user.id,
        title,
        description: `Added via voice: ${input.text}`,
        dueDate,
        priority,
        status: "pending",
        completed: false,
      }).returning();
      
      return {
        success: true,
        task,
        message: `Task "${title}" created${dueDate ? ` for ${dueDate.toDateString()}` : ""}.`,
      };
    }),

  // Get morning briefing via voice
  // POST /api/trpc/voice.morningBriefing
  // Headers: X-Voice-Token: <token>
  morningBriefing: publicQuery
    .input(z.object({
      userEmail: z.string().email().optional().default("markie@gofig.ca"),
    }))
    .query(async ({ ctx, input }) => {
      const token = (ctx as any).req?.headers?.["x-voice-token"] || "";
      if (!validateVoiceToken(token)) {
        throw new Error("Invalid voice token");
      }

      const db = getDb();
      const userRows = await db.select().from(users).where(eq(users.email, input.userEmail)).limit(1);
      const user = userRows[0];
      if (!user) {
        throw new Error("User not found");
      }
      
      const userId = user.id;
      const userName = user.name || user.email;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      // Get all open tasks
      const allTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.userId, userId))
        .orderBy(tasks.dueDate);
      
      const openTasks = allTasks.filter((t: { completed: boolean }) => !t.completed);
      const overdue = openTasks.filter((t: { dueDate: Date | null }) => t.dueDate && new Date(t.dueDate) < today);
      const dueToday = openTasks.filter((t: { dueDate: Date | null }) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        return d >= today && d < tomorrow;
      });
      const upcoming = openTasks.filter((t: { dueDate: Date | null }) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        return d >= tomorrow && d <= nextWeek;
      });
      const highPriority = openTasks.filter((t: { priority: string }) => t.priority === "high");
      
      // Build spoken summary
      let speech = `Good morning. `;
      
      if (overdue.length > 0) {
        speech += `You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}. `;
        speech += `The oldest is: ${overdue[0].title}. `;
      }
      
      if (highPriority.length > 0) {
        speech += `You have ${highPriority.length} high priority task${highPriority.length > 1 ? 's' : ''}. `;
      }
      
      if (dueToday.length > 0) {
        speech += `You have ${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today. `;
      }
      
      if (overdue.length === 0 && highPriority.length === 0 && dueToday.length === 0) {
        speech += "You're all caught up! No urgent tasks. ";
      }
      
      speech += `Total open tasks: ${openTasks.length}. `;
      
      // Suggest top 3 priorities
      const topTasks = [...overdue, ...highPriority, ...dueToday].slice(0, 3);
      if (topTasks.length > 0) {
        speech += "Your top priorities are: ";
        topTasks.forEach((t, i) => {
          speech += `${i + 1}. ${t.title}. `;
        });
      }
      
      return {
        speech,
        summary: {
          overdue: overdue.length,
          dueToday: dueToday.length,
          upcoming: upcoming.length,
          highPriority: highPriority.length,
          totalOpen: openTasks.length,
        },
        topTasks: topTasks.map(t => ({ id: t.id, title: t.title, priority: t.priority })),
      };
    }),
});
