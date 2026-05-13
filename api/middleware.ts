import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Role hierarchy: admin > senior_bookkeeper > junior_bookkeeper > client
// Each role can access their own level and below (except client which only sees their own data)
const ROLE_RANK: Record<string, number> = {
  admin: 4,
  senior_bookkeeper: 3,
  junior_bookkeeper: 2,
  client: 1,
};

function requireMinRole(minRole: string) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: ErrorMessages.unauthenticated,
      });
    }

    const userRank = ROLE_RANK[ctx.user.role] || 0;
    const requiredRank = ROLE_RANK[minRole] || 0;

    if (userRank < requiredRank) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(requireAuth);

// Admin only
export const adminQuery = authedQuery.use(requireMinRole("admin"));

// Senior bookkeeper and above
export const seniorQuery = authedQuery.use(requireMinRole("senior_bookkeeper"));

// Junior bookkeeper and above (any staff)
export const staffQuery = authedQuery.use(requireMinRole("junior_bookkeeper"));

// Client role (for client portal access)
export const clientQuery = authedQuery.use(requireMinRole("client"));
