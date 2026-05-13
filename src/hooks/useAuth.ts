import { trpc } from "@/providers/trpc";
import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { LOGIN_PATH } from "@/const";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export type UserRole = "admin" | "senior_bookkeeper" | "junior_bookkeeper" | "client";

const ROLE_RANK: Record<UserRole, number> = {
  admin: 4,
  senior_bookkeeper: 3,
  junior_bookkeeper: 2,
  client: 1,
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = LOGIN_PATH } =
    options ?? {};

  const navigate = useNavigate();

  const utils = trpc.useUtils();

  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = trpc.auth.me.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      navigate(redirectPath);
    },
  });

  const logout = useCallback(() => logoutMutation.mutate(), [logoutMutation]);

  useEffect(() => {
    if (redirectOnUnauthenticated && !isLoading && !user) {
      const currentPath = window.location.pathname;
      if (currentPath !== redirectPath) {
        navigate(redirectPath);
      }
    }
  }, [redirectOnUnauthenticated, isLoading, user, navigate, redirectPath]);

  const role = (user?.role as UserRole) || "junior_bookkeeper";
  const rank = ROLE_RANK[role] || 0;

  const can = useMemo(() => ({
    // Admin can do everything
    admin: rank >= 4,
    // Senior+ can access vault, QBO, payroll, AI, user mgmt
    senior: rank >= 3,
    // Junior+ can do basic bookkeeping
    staff: rank >= 2,
    // Client only sees their own data
    client: rank >= 1,
  }), [rank]);

  return useMemo(
    () => ({
      user: user ?? null,
      isAuthenticated: !!user,
      isLoading: isLoading || logoutMutation.isPending,
      error,
      logout,
      refresh: refetch,
      role,
      can,
    }),
    [user, isLoading, logoutMutation.isPending, error, logout, refetch, role, can],
  );
}
