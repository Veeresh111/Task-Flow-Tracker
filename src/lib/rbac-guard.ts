import { supabase } from "@/lib/supabase";

export type Role = "admin" | "hr" | "manager" | "team_lead" | "employee" | "candidate";

export interface SecurityUserContext {
  userId: string;
  role: Role;
  department?: string;
  email?: string;
}

export class SecurityForbiddenError extends Error {
  public status: number = 403;
  constructor(message: string) {
    super(message);
    this.name = "SecurityForbiddenError";
  }
}

/**
 * Server-Side / Controller Role-Based Access Control (RBAC) Guard
 */
export async function enforceRoleGuard(
  allowedRoles: Role[],
  explicitUserContext?: Partial<SecurityUserContext>
): Promise<SecurityUserContext> {
  let userId = explicitUserContext?.userId;
  let role = explicitUserContext?.role;
  let department = explicitUserContext?.department;

  // 1. If explicit role context provided (e.g., in testing or service calls)
  if (userId && role) {
    if (!allowedRoles.includes(role)) {
      console.warn(
        `🚨 [SECURITY_RBAC_BLOCKED] User ${userId} with role '${role}' attempted unauthorized access to restricted endpoint. Allowed: [${allowedRoles.join(
          ", "
        )}]`
      );
      throw new SecurityForbiddenError(
        `403 Forbidden: User with role '${role}' is not authorized to execute this administrative endpoint.`
      );
    }
    return { userId, role, department };
  }

  // 2. Resolve from active Supabase Session
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    console.warn(`🚨 [SECURITY_RBAC_BLOCKED] Unauthenticated access attempt to restricted endpoint.`);
    throw new SecurityForbiddenError("401 Unauthorized: Valid authentication token required.");
  }

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, role, department, status")
    .eq("id", user.id)
    .single();

  if (profErr || !profile || profile.status === "archived") {
    console.warn(`🚨 [SECURITY_RBAC_BLOCKED] Suspended/Archived user ${user.id} attempted database access.`);
    throw new SecurityForbiddenError("403 Forbidden: Account is suspended or archived.");
  }

  const resolvedRole = (profile.role?.toLowerCase() as Role) || "employee";

  if (!allowedRoles.includes(resolvedRole)) {
    console.warn(
      `🚨 [SECURITY_RBAC_BLOCKED] User ${user.id} (${profile.role}) attempted unauthorized access. Allowed: [${allowedRoles.join(
        ", "
      )}]`
    );
    throw new SecurityForbiddenError(
      `403 Forbidden: User with role '${profile.role}' is not authorized to execute this endpoint.`
    );
  }

  return {
    userId: profile.id,
    role: resolvedRole,
    department: profile.department
  };
}

/**
 * Higher-Order Function wrapper for Controller Actions
 */
export function withRoleGuard<TArgs extends any[], TReturn>(
  allowedRoles: Role[],
  fn: (context: SecurityUserContext, ...args: TArgs) => Promise<TReturn>
) {
  return async (...args: TArgs): Promise<TReturn> => {
    const context = await enforceRoleGuard(allowedRoles);
    return await fn(context, ...args);
  };
}
