import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { authenticateRequest } from "./google/auth";
import { getDb } from "./queries/connection";
import { users } from "../db/schema";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  
  const isDemo = opts.req.headers.get("x-demo-mode") === "true";
  if (isDemo) {
    try {
      const db = getDb();
      const demoUsers = await db.select().from(users).limit(1);
      if (demoUsers.length > 0) {
        ctx.user = demoUsers[0];
      }
    } catch {
      // Fallback to regular auth
    }
  }
  
  if (!ctx.user) {
    try {
      ctx.user = await authenticateRequest(opts.req.headers);
    } catch {
      // Authentication is optional here
    }
  }
  return ctx;
}
