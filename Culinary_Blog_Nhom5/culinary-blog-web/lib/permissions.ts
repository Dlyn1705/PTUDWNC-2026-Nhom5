import type { AppRole } from "@/types/auth";

export function hasRole(
  user: { role?: AppRole; roles?: readonly AppRole[] } | null | undefined,
  role: AppRole,
): boolean {
  return !!user && (user.roles?.includes(role) === true || user.role === role);
}
