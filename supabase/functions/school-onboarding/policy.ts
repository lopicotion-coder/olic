export type RoleScope = "platform" | "tenant" | "school" | "class";

export type ActorAssignment = {
  tenant_id: string | null;
  school_id: string | null;
  class_id: string | null;
  scope: RoleScope;
  permissions: string[];
};

export type TenantMembershipState = {
  tenant_id: string;
  status: string;
};

export type SchoolMembershipState = {
  tenant_id: string;
  school_id: string;
  status: string;
};

export type ActorAuthorizationContext = {
  assignments: ActorAssignment[];
  tenantMemberships: TenantMembershipState[];
  schoolMemberships: SchoolMembershipState[];
};

export type SchoolRoleKey =
  | "school_admin"
  | "school_owner"
  | "supervisor"
  | "teacher"
  | "student"
  | "parent";

const SCHOOL_ROLE_SCOPES: Record<SchoolRoleKey, RoleScope> = {
  school_admin: "school",
  school_owner: "school",
  supervisor: "school",
  teacher: "class",
  student: "school",
  parent: "school",
};

export function normalizeEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    email.length < 6 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("INVALID_EMAIL");
  }
  return email;
}

export function normalizeSlug(value: unknown): string {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug)) {
    throw new Error("INVALID_SLUG");
  }
  return slug;
}

export function normalizeSchoolRole(value: unknown): SchoolRoleKey {
  const role = String(value ?? "").trim().toLowerCase();
  if (!Object.hasOwn(SCHOOL_ROLE_SCOPES, role)) {
    throw new Error("UNSUPPORTED_SCHOOL_ROLE");
  }
  return role as SchoolRoleKey;
}

export function schoolRoleScope(role: SchoolRoleKey): RoleScope {
  return SCHOOL_ROLE_SCOPES[role];
}

export function uniqueIds(values: unknown, maximum = 25): string[] {
  if (values === undefined || values === null) return [];
  if (!Array.isArray(values) || values.length > maximum) {
    throw new Error("INVALID_ID_LIST");
  }
  const normalized = values.map((value) => {
    if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
      throw new Error("INVALID_ID_LIST");
    }
    return value.toLowerCase();
  });
  return [...new Set(normalized)];
}

function hasActiveTenant(context: ActorAuthorizationContext, tenantId: string): boolean {
  return context.tenantMemberships.some(
    (membership) => membership.tenant_id === tenantId && membership.status === "active",
  );
}

function hasActiveSchool(
  context: ActorAuthorizationContext,
  tenantId: string,
  schoolId: string,
): boolean {
  return context.schoolMemberships.some(
    (membership) =>
      membership.tenant_id === tenantId &&
      membership.school_id === schoolId &&
      membership.status === "active",
  );
}

/**
 * Reproduces the relevant app.has_permission scope semantics from the live
 * membership/role tables. It is used only after the caller JWT has been
 * validated by Supabase Auth; data is loaded server-side by service_role.
 */
export function hasScopedPermission(
  context: ActorAuthorizationContext,
  permission: string,
  tenantId: string | null,
  schoolId: string | null,
  classId: string | null = null,
  requireTenantScope = false,
): boolean {
  return context.assignments.some((assignment) => {
    if (!assignment.permissions.includes(permission)) return false;

    if (assignment.scope === "platform") {
      return assignment.tenant_id === null &&
        assignment.school_id === null &&
        assignment.class_id === null;
    }

    if (!tenantId || assignment.tenant_id !== tenantId || !hasActiveTenant(context, tenantId)) {
      return false;
    }

    if (assignment.scope === "tenant") {
      return assignment.school_id === null &&
        assignment.class_id === null;
    }

    if (requireTenantScope || !schoolId || assignment.school_id !== schoolId ||
        !hasActiveSchool(context, tenantId, schoolId)) {
      return false;
    }

    if (assignment.scope === "school") {
      return assignment.class_id === null;
    }

    return assignment.scope === "class" && Boolean(classId) && assignment.class_id === classId;
  });
}

export function validateRosterPayload(
  role: SchoolRoleKey,
  roster: Record<string, unknown>,
  classIds: string[],
  studentIds: string[],
): void {
  const firstName = String(roster.first_name ?? "").trim();
  const lastName = String(roster.last_name ?? "").trim();
  if (role === "student" || role === "teacher" || role === "parent") {
    if (firstName.length < 1 || firstName.length > 100 ||
        lastName.length < 1 || lastName.length > 100) {
      throw new Error("INVALID_ROSTER_NAME");
    }
  }

  if (role === "teacher" && classIds.length === 0) {
    throw new Error("TEACHER_REQUIRES_CLASS_ASSIGNMENT");
  }
  if (role !== "teacher" && classIds.length > 0) {
    throw new Error("CLASS_ASSIGNMENTS_ONLY_ALLOWED_FOR_TEACHERS");
  }

  if (role === "parent" && studentIds.length === 0) {
    throw new Error("PARENT_REQUIRES_STUDENT_LINK");
  }
  if (role !== "parent" && studentIds.length > 0) {
    throw new Error("STUDENT_LINKS_ONLY_ALLOWED_FOR_PARENTS");
  }

  if (role === "student") {
    const number = String(roster.student_number ?? "").trim();
    if (!number || number.length > 64) throw new Error("INVALID_STUDENT_NUMBER");
  }
  if (role === "teacher") {
    const employeeNumber = roster.employee_number;
    if (employeeNumber !== undefined && employeeNumber !== null &&
        String(employeeNumber).trim().length > 64) {
      throw new Error("INVALID_EMPLOYEE_NUMBER");
    }
  }
  if (role === "parent") {
    const relationship = String(roster.relationship ?? "").trim();
    if (!relationship || relationship.length > 40) {
      throw new Error("INVALID_GUARDIAN_RELATIONSHIP");
    }
  }
}
