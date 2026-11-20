import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  canInviteSchoolRole,
  hasScopedPermission,
  normalizeEmail,
  normalizeSchoolRole,
  normalizeSlug,
  schoolRoleScope,
  uniqueIds,
  validateRosterPayload,
  type ActorAuthorizationContext,
  type ActorAssignment,
  type SchoolRoleKey,
  type SchoolRoleScope,
} from "./policy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_REDIRECT_URL = Deno.env.get("APP_REDIRECT_URL") ?? "";
const MAX_BODY_BYTES = 64 * 1024;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
  "cache-control": "no-store",
};

class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function fail(status: number, code: string): never {
  throw new ApiError(status, code);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalText(value: unknown, maximum = 180): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") fail(400, "INVALID_TEXT_FIELD");
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) fail(400, "INVALID_TEXT_FIELD");
  return normalized;
}

function requiredText(value: unknown, maximum = 180): string {
  const normalized = optionalText(value, maximum);
  if (!normalized) fail(400, "REQUIRED_FIELD_MISSING");
  return normalized;
}

function dateOrNull(value: unknown): string | null {
  const normalized = optionalText(value, 10);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) fail(400, "INVALID_DATE");
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    fail(400, "INVALID_DATE");
  }
  return normalized;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof ApiError) return error.code;
  return "PROVISIONING_FAILED";
}

function dbErrorCode(error: { code?: string; message?: string } | null): string {
  if (!error) return "DATABASE_OPERATION_FAILED";
  if (error.code === "23505") return "DUPLICATE_RECORD";
  if (error.code === "23503") return "RELATED_RECORD_NOT_FOUND";
  if (error.code === "23514") return "DATABASE_VALIDATION_FAILED";
  return "DATABASE_OPERATION_FAILED";
}

async function queryData<T>(
  request: PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>,
): Promise<T> {
  const { data, error } = await request;
  if (error) fail(error.code === "23505" ? 409 : 500, dbErrorCode(error));
  if (data === null) fail(500, "DATABASE_RETURNED_NO_DATA");
  return data;
}

async function maybeData<T>(
  request: PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>,
): Promise<T | null> {
  const { data, error } = await request;
  if (error) fail(error.code === "23505" ? 409 : 500, dbErrorCode(error));
  return data;
}

async function bestEffort(
  label: string,
  operation: () => PromiseLike<{ error?: { code?: string; message?: string } | null } | void> | { error?: { code?: string; message?: string } | null } | void,
): Promise<void> {
  try {
    const result = await operation();
    const error = result && "error" in result ? result.error : null;
    if (error) console.error("Onboarding compensation failed", { label, code: error.code ?? "UNKNOWN" });
  } catch {
    console.error("Onboarding compensation failed", { label, code: "UNEXPECTED" });
  }
}

type AdminClient = SupabaseClient<any, "public", "public", any, any>;

async function loadActorAuthorization(
  admin: AdminClient,
  actorId: string,
): Promise<ActorAuthorizationContext> {
  const assignments = await queryData<Array<{
    role_id: string;
    tenant_id: string | null;
    school_id: string | null;
    class_id: string | null;
  }>>(admin.from("membership_roles")
    .select("role_id,tenant_id,school_id,class_id")
    .eq("user_id", actorId));

  const roleIds = [...new Set(assignments.map((item) => item.role_id))];
  if (roleIds.length === 0) {
    return { assignments: [], tenantMemberships: [], schoolMemberships: [] };
  }

  const [roles, rolePermissions, tenantMemberships, schoolMemberships] = await Promise.all([
    queryData<Array<{ id: string; scope: string }>>(admin.from("roles").select("id,scope").in("id", roleIds)),
    queryData<Array<{ role_id: string; permission_id: string }>>(
      admin.from("role_permissions").select("role_id,permission_id").in("role_id", roleIds),
    ),
    queryData<Array<{ tenant_id: string; status: string }>>(
      admin.from("tenant_memberships").select("tenant_id,status").eq("user_id", actorId).eq("status", "active"),
    ),
    queryData<Array<{ tenant_id: string; school_id: string; status: string }>>(
      admin.from("school_memberships").select("tenant_id,school_id,status").eq("user_id", actorId).eq("status", "active"),
    ),
  ]);

  const permissionIds = [...new Set(rolePermissions.map((item) => item.permission_id))];
  const permissions = permissionIds.length
    ? await queryData<Array<{ id: string; key: string }>>(
      admin.from("permissions").select("id,key").in("id", permissionIds),
    )
    : [];
  const permissionById = new Map(permissions.map((item) => [item.id, item.key]));
  const scopeByRole = new Map(roles.map((item) => [item.id, item.scope]));
  const permissionsByRole = new Map<string, string[]>();

  for (const row of rolePermissions) {
    const key = permissionById.get(row.permission_id);
    if (!key) continue;
    const values = permissionsByRole.get(row.role_id) ?? [];
    values.push(key);
    permissionsByRole.set(row.role_id, values);
  }

  const actorAssignments: ActorAssignment[] = assignments.flatMap((assignment) => {
    const scope = scopeByRole.get(assignment.role_id);
    if (!["platform", "tenant", "school", "class"].includes(String(scope))) return [];
    return [{
      tenant_id: assignment.tenant_id,
      school_id: assignment.school_id,
      class_id: assignment.class_id,
      scope: scope as ActorAssignment["scope"],
      permissions: permissionsByRole.get(assignment.role_id) ?? [],
    }];
  });

  return {
    assignments: actorAssignments,
    tenantMemberships,
    schoolMemberships,
  };
}

async function getRole(
  admin: AdminClient,
  roleKey: string,
  expectedScope: "tenant" | "school" | "class",
): Promise<{ id: string; key: string; scope: string }> {
  const row = await maybeData<{ id: string; key: string; scope: string }>(
    admin.from("roles").select("id,key,scope").eq("key", roleKey).maybeSingle(),
  );
  if (!row || row.scope !== expectedScope) fail(500, "ROLE_CATALOG_MISMATCH");
  return row;
}

async function inviteAuthUser(
  admin: AdminClient,
  email: string,
  displayName: string,
): Promise<{ id: string; email: string | null }> {
  const profileRows = await queryData<Array<{ id: string }>>(
    admin.from("profiles").select("id").eq("email", email).limit(2),
  );
  if (profileRows.length > 0) fail(409, "ACCOUNT_ALREADY_EXISTS_USE_ACCOUNT_LINKING");

  if (!APP_REDIRECT_URL) fail(503, "APP_REDIRECT_URL_REQUIRED_FOR_INVITATIONS");
  const options: { data: Record<string, unknown>; redirectTo?: string } = {
    data: { display_name: displayName },
  };
  let redirect: URL;
  try {
    redirect = new URL(APP_REDIRECT_URL);
  } catch {
    fail(500, "APP_REDIRECT_URL_INVALID");
  }
  if (redirect!.protocol !== "https:" && redirect!.hostname !== "localhost" &&
      redirect!.hostname !== "127.0.0.1") {
    fail(500, "APP_REDIRECT_URL_MUST_USE_HTTPS");
  }
  redirect!.searchParams.set("invite", "1");
  options.redirectTo = redirect!.toString();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, options);
  if (error || !data.user?.id) {
    const message = String(error?.message ?? "").toLowerCase();
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      fail(409, "ACCOUNT_ALREADY_EXISTS_USE_ACCOUNT_LINKING");
    }
    fail(502, "AUTH_INVITATION_FAILED");
  }
  return { id: data.user.id, email: data.user.email ?? email };
}

async function insertProfile(
  admin: AdminClient,
  userId: string,
  email: string,
  displayName: string,
): Promise<void> {
  await queryData(admin.from("profiles").insert({
    id: userId,
    email,
    display_name: displayName,
    preferred_locale: "ar",
    timezone: "Africa/Cairo",
  }).select("id").single());
}

async function insertMemberships(
  admin: AdminClient,
  actorId: string,
  userId: string,
  roleId: string,
  roleScope: SchoolRoleScope,
  tenantId: string,
  schoolId: string | null,
  classIds: string[],
): Promise<void> {
  await queryData(admin.from("tenant_memberships").insert({
    tenant_id: tenantId,
    user_id: userId,
    status: "invited",
    invited_by: actorId,
  }).select("id").single());

  if (schoolId) {
    await queryData(admin.from("school_memberships").insert({
      tenant_id: tenantId,
      school_id: schoolId,
      user_id: userId,
      status: "invited",
    }).select("id").single());
  }

  const roles: Array<{
    user_id: string;
    role_id: string;
    tenant_id: string;
    school_id: string | null;
    class_id: string | null;
    assigned_by: string;
  }> = roleScope === "class"
    ? classIds.map((classId) => ({
      user_id: userId,
      role_id: roleId,
      tenant_id: tenantId,
      school_id: schoolId,
      class_id: classId,
      assigned_by: actorId,
    }))
    : [{
      user_id: userId,
      role_id: roleId,
      tenant_id: tenantId,
      school_id: schoolId,
      class_id: null,
      assigned_by: actorId,
    }];

  await queryData(admin.from("membership_roles").insert(roles).select("id"));
}

type RosterResult = { entityType: string; entityId: string | null };

async function insertRoster(
  admin: AdminClient,
  actorId: string,
  userId: string,
  email: string,
  tenantId: string,
  schoolId: string,
  role: SchoolRoleKey,
  roster: Record<string, unknown>,
  studentIds: string[],
  verifiedClasses: Array<{ id: string; academic_year_id: string }>,
): Promise<RosterResult> {
  if (role === "student") {
    const admissionDate = dateOrNull(roster.admission_date);
    const row = await queryData<{ id: string }>(admin.from("students").insert({
      tenant_id: tenantId,
      school_id: schoolId,
      profile_id: userId,
      student_number: requiredText(roster.student_number, 64),
      first_name: requiredText(roster.first_name, 100),
      middle_name: optionalText(roster.middle_name, 100),
      last_name: requiredText(roster.last_name, 100),
      date_of_birth: dateOrNull(roster.date_of_birth),
      admission_date: admissionDate,
      contact_email: email,
    }).select("id").single());

    const enrollments = verifiedClasses.map((schoolClass) => ({
      tenant_id: tenantId,
      school_id: schoolId,
      student_id: row.id,
      class_id: schoolClass.id,
      academic_year_id: schoolClass.academic_year_id,
      ...(admissionDate ? { enrolled_on: admissionDate } : {}),
      created_by: actorId,
    }));
    await queryData(admin.from("student_enrollments").insert(enrollments).select("id"));
    return { entityType: "student", entityId: row.id };
  }

  if (role === "teacher") {
    const row = await queryData<{ id: string }>(admin.from("teachers").insert({
      tenant_id: tenantId,
      school_id: schoolId,
      profile_id: userId,
      employee_number: optionalText(roster.employee_number, 64),
      first_name: requiredText(roster.first_name, 100),
      last_name: requiredText(roster.last_name, 100),
      email,
      phone: optionalText(roster.phone, 40),
    }).select("id").single());
    return { entityType: "teacher", entityId: row.id };
  }

  if (role === "parent") {
    const guardian = await queryData<{ id: string }>(admin.from("guardians").insert({
      tenant_id: tenantId,
      school_id: schoolId,
      profile_id: userId,
      first_name: requiredText(roster.first_name, 100),
      last_name: requiredText(roster.last_name, 100),
      email,
      phone: optionalText(roster.phone, 40),
    }).select("id").single());

    const links = studentIds.map((studentId) => ({
      tenant_id: tenantId,
      school_id: schoolId,
      student_id: studentId,
      guardian_id: guardian.id,
      relationship: requiredText(roster.relationship, 40),
      is_primary: Boolean(roster.is_primary),
      can_receive_notifications: true,
    }));
    await queryData(admin.from("student_guardians").insert(links).select("student_id"));
    return { entityType: "guardian", entityId: guardian.id };
  }

  return { entityType: "profile", entityId: null };
}

async function writeAudit(
  admin: AdminClient,
  requestId: string,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  tenantId: string | null,
  schoolId: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await queryData(admin.from("audit_logs").insert({
    tenant_id: tenantId,
    school_id: schoolId,
    actor_user_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    request_id: requestId,
    metadata,
  }).select("id").single());
}

type CompensationState = {
  userId?: string;
  authCreated?: boolean;
  tenantId?: string;
  schoolId?: string;
  createdEntity?: "tenant" | "school";
};

async function rollback(
  admin: AdminClient,
  state: CompensationState,
  requestId: string,
): Promise<void> {
  const userId = state.userId;
  if (userId) {
    await bestEffort("remove audit rows", () =>
      admin.from("audit_logs").delete().eq("request_id", requestId));
    await bestEffort("remove student guardian links", async () => {
      const guardian = await admin.from("guardians").select("id").eq("profile_id", userId).maybeSingle();
      if (guardian.data?.id) {
        return await admin.from("student_guardians").delete().eq("guardian_id", guardian.data.id);
      }
    });
    await bestEffort("remove student enrollments", async () => {
      const student = await admin.from("students").select("id").eq("profile_id", userId).maybeSingle();
      if (student.data?.id) {
        return await admin.from("student_enrollments").delete().eq("student_id", student.data.id);
      }
    });
    await bestEffort("remove student roster", () => admin.from("students").delete().eq("profile_id", userId));
    await bestEffort("remove teacher roster", () => admin.from("teachers").delete().eq("profile_id", userId));
    await bestEffort("remove guardian roster", () => admin.from("guardians").delete().eq("profile_id", userId));
    await bestEffort("remove role assignments", () => admin.from("membership_roles").delete().eq("user_id", userId));
    await bestEffort("remove school memberships", () => admin.from("school_memberships").delete().eq("user_id", userId));
    await bestEffort("remove tenant memberships", () => admin.from("tenant_memberships").delete().eq("user_id", userId));
    await bestEffort("remove profile", () => admin.from("profiles").delete().eq("id", userId));
    if (state.authCreated) {
      await bestEffort("remove invited Auth user", async () => {
        const { error } = await admin.auth.admin.deleteUser(userId);
        return { error };
      });
    }
  }

  if (state.createdEntity === "school" && state.schoolId) {
    await bestEffort("remove orphan school", () => admin.from("schools").delete().eq("id", state.schoolId!));
  }
  if (state.createdEntity === "tenant" && state.tenantId) {
    await bestEffort("remove orphan tenant", () => admin.from("tenants").delete().eq("id", state.tenantId!));
  }
}

async function findSchool(
  admin: AdminClient,
  tenantId: string,
  schoolId: string,
): Promise<{ id: string; tenant_id: string }> {
  const school = await maybeData<{ id: string; tenant_id: string }>(
    admin.from("schools").select("id,tenant_id").eq("id", schoolId).eq("tenant_id", tenantId).maybeSingle(),
  );
  if (!school) fail(404, "SCHOOL_NOT_FOUND_IN_TENANT");
  return school;
}

async function verifyClassIds(
  admin: AdminClient,
  tenantId: string,
  schoolId: string,
  classIds: string[],
): Promise<Array<{ id: string; academic_year_id: string }>> {
  if (classIds.length === 0) return [];
  const rows = await queryData<Array<{ id: string; academic_year_id: string }>>(
    admin.from("classes").select("id,academic_year_id")
      .eq("tenant_id", tenantId).eq("school_id", schoolId).in("id", classIds),
  );
  if (rows.length !== classIds.length || rows.some((row) => !row.academic_year_id)) {
    fail(400, "CLASS_OUTSIDE_SCHOOL_OR_MISSING_ACADEMIC_YEAR");
  }
  return rows;
}

async function verifyStudentIds(
  admin: AdminClient,
  tenantId: string,
  schoolId: string,
  studentIds: string[],
): Promise<void> {
  if (studentIds.length === 0) return;
  const rows = await queryData<Array<{ id: string }>>(
    admin.from("students").select("id").eq("tenant_id", tenantId).eq("school_id", schoolId).in("id", studentIds),
  );
  if (rows.length !== studentIds.length) fail(400, "STUDENT_OUTSIDE_SCHOOL_OR_NOT_FOUND");
}

async function provisionUser(
  admin: AdminClient,
  requestId: string,
  actorId: string,
  tenantId: string,
  schoolId: string | null,
  roleKey: "tenant_owner" | SchoolRoleKey,
  email: string,
  displayName: string,
  roster: Record<string, unknown>,
  classIds: string[],
  studentIds: string[],
  verifiedClasses: Array<{ id: string; academic_year_id: string }>,
  state: CompensationState,
): Promise<{ userId: string; entityType: string; entityId: string | null }> {
  const expectedScope: SchoolRoleScope = roleKey === "tenant_owner" ? "tenant" : schoolRoleScope(roleKey);
  const role = await getRole(admin, roleKey, expectedScope);
  const invited = await inviteAuthUser(admin, email, displayName);
  state.userId = invited.id;
  state.authCreated = true;

  await insertProfile(admin, invited.id, email, displayName);
  await insertMemberships(admin, actorId, invited.id, role.id, expectedScope, tenantId, schoolId, classIds);

  const rosterResult = schoolId && roleKey !== "tenant_owner"
    ? await insertRoster(admin, actorId, invited.id, email, tenantId, schoolId, roleKey, roster, studentIds, verifiedClasses)
    : { entityType: "tenant_owner", entityId: null };

  await writeAudit(
    admin,
    requestId,
    actorId,
    "membership.invited",
    "auth_user",
    invited.id,
    tenantId,
    schoolId,
    { role_key: roleKey, role_scope: expectedScope, class_count: classIds.length },
  );
  return { userId: invited.id, ...rosterResult };
}

async function createTenant(
  admin: AdminClient,
  context: ActorAuthorizationContext,
  actorId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!hasScopedPermission(context, "platform.tenants.manage", null, null)) {
    fail(403, "PLATFORM_TENANT_MANAGEMENT_REQUIRED");
  }
  const tenantInput = asRecord(body.tenant);
  const ownerInput = asRecord(body.owner);
  const tenant = {
    legal_name: requiredText(tenantInput.legal_name, 180),
    display_name: requiredText(tenantInput.display_name, 180),
    slug: normalizeSlug(tenantInput.slug),
    default_locale: optionalText(tenantInput.default_locale, 8) ?? "ar",
    timezone: optionalText(tenantInput.timezone, 80) ?? "Africa/Cairo",
  };
  const email = normalizeEmail(ownerInput.email);
  const ownerName = requiredText(ownerInput.display_name, 180);
  const state: CompensationState = { createdEntity: "tenant" };

  try {
    const created = await queryData<{ id: string }>(
      admin.from("tenants").insert(tenant).select("id").single(),
    );
    state.tenantId = created.id;
    const owner = await provisionUser(
      admin, requestId, actorId, created.id, null, "tenant_owner", email,
      ownerName, {}, [], [], [], state,
    );
    await writeAudit(admin, requestId, actorId, "tenant.created", "tenant", created.id, created.id, null, {
      owner_user_id: owner.userId,
    });
    return { tenant_id: created.id, owner_user_id: owner.userId, status: "invited" };
  } catch (error) {
    await rollback(admin, state, requestId);
    throw error;
  }
}

async function createSchool(
  admin: AdminClient,
  context: ActorAuthorizationContext,
  actorId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const tenantId = requiredText(body.tenant_id, 36);
  const authorized =
    hasScopedPermission(context, "platform.schools.manage", tenantId, null) ||
    hasScopedPermission(context, "schools.manage", tenantId, null, null, true);
  if (!authorized) fail(403, "SCHOOL_CREATION_PERMISSION_REQUIRED");

  const schoolInput = asRecord(body.school);
  const ownerInput = asRecord(body.owner);
  // Match the verified live production schema. Curriculum metadata is intentionally
  // omitted until its dedicated migration, RLS, and API contract are validated.
  const schoolPayload: Record<string, unknown> = {
    tenant_id: tenantId,
    name: requiredText(schoolInput.name, 180),
    slug: normalizeSlug(schoolInput.slug),
    default_locale: optionalText(schoolInput.default_locale, 8) ?? "ar",
    timezone: optionalText(schoolInput.timezone, 80) ?? "Africa/Cairo",
  };
  const schoolCode = optionalText(schoolInput.code, 40);
  if (schoolCode) schoolPayload.code = schoolCode;

  const email = normalizeEmail(ownerInput.email);
  const ownerName = requiredText(ownerInput.display_name, 180);
  const state: CompensationState = { createdEntity: "school", tenantId };

  try {
    const created = await queryData<{ id: string }>(
      admin.from("schools").insert(schoolPayload).select("id").single(),
    );
    state.schoolId = created.id;
    const owner = await provisionUser(
      admin, requestId, actorId, tenantId, created.id, "school_owner", email,
      ownerName, {}, [], [], [], state,
    );
    await writeAudit(admin, requestId, actorId, "school.created", "school", created.id, tenantId, created.id, {
      owner_user_id: owner.userId,
    });
    return { tenant_id: tenantId, school_id: created.id, owner_user_id: owner.userId, status: "invited" };
  } catch (error) {
    await rollback(admin, state, requestId);
    throw error;
  }
}

async function inviteSchoolMember(
  admin: AdminClient,
  context: ActorAuthorizationContext,
  actorId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const tenantId = requiredText(body.tenant_id, 36);
  const schoolId = requiredText(body.school_id, 36);
  const roleKey = normalizeSchoolRole(body.role_key);
  if (!canInviteSchoolRole(context, roleKey, tenantId, schoolId)) {
    fail(403, "ROLE_INVITATION_NOT_AUTHORIZED");
  }

  await findSchool(admin, tenantId, schoolId);
  const email = normalizeEmail(body.email);
  const classIds = uniqueIds(body.class_ids);
  const studentIds = uniqueIds(body.student_ids);
  const roster = asRecord(body.roster);
  validateRosterPayload(roleKey, roster, classIds, studentIds);

  const verifiedClasses = await verifyClassIds(admin, tenantId, schoolId, classIds);
  await verifyStudentIds(admin, tenantId, schoolId, studentIds);

  if (roleKey === "student") {
    const studentNumber = requiredText(roster.student_number, 64);
    const duplicate = await maybeData<{ id: string }>(
      admin.from("students").select("id").eq("school_id", schoolId).eq("student_number", studentNumber).maybeSingle(),
    );
    if (duplicate) fail(409, "STUDENT_NUMBER_ALREADY_EXISTS");
  }
  if (roleKey === "teacher" && roster.employee_number) {
    const duplicate = await maybeData<{ id: string }>(
      admin.from("teachers").select("id").eq("school_id", schoolId)
        .eq("employee_number", String(roster.employee_number).trim()).maybeSingle(),
    );
    if (duplicate) fail(409, "EMPLOYEE_NUMBER_ALREADY_EXISTS");
  }

  const displayName = optionalText(body.display_name, 180) ||
    [roster.first_name, roster.last_name].filter((value) => typeof value === "string").join(" ").trim() ||
    email;
  if (!displayName) fail(400, "DISPLAY_NAME_REQUIRED");
  const state: CompensationState = { tenantId, schoolId };

  try {
    const result = await provisionUser(
      admin, requestId, actorId, tenantId, schoolId, roleKey, email,
      displayName, roster, classIds, studentIds, verifiedClasses, state,
    );
    return {
      user_id: result.userId,
      tenant_id: tenantId,
      school_id: schoolId,
      role_key: roleKey,
      roster_record_type: result.entityType,
      roster_record_id: result.entityId,
      status: "invited",
    };
  } catch (error) {
    await rollback(admin, state, requestId);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "ONBOARDING_NOT_CONFIGURED" }, 503);

  const requestId = crypto.randomUUID();
  try {
    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (contentLength > MAX_BODY_BYTES) fail(413, "REQUEST_TOO_LARGE");
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) fail(413, "REQUEST_TOO_LARGE");

    let body: Record<string, unknown>;
    try {
      body = asRecord(JSON.parse(raw));
    } catch {
      fail(400, "INVALID_JSON");
    }
    if (Object.keys(body!).length === 0) fail(400, "INVALID_REQUEST_BODY");

    const authorization = req.headers.get("authorization") ?? "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) fail(401, "AUTHENTICATION_REQUIRED");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(match[1]);
    if (authError || !authData.user) fail(401, "INVALID_AUTHENTICATION");
    const actor = authData.user;
    const context = await loadActorAuthorization(admin, actor.id);

    let result: Record<string, unknown>;
    switch (body!.action) {
      case "create_tenant":
        result = await createTenant(admin, context, actor.id, requestId, body!);
        break;
      case "create_school":
        result = await createSchool(admin, context, actor.id, requestId, body!);
        break;
      case "invite_member":
        result = await inviteSchoolMember(admin, context, actor.id, requestId, body!);
        break;
      default:
        fail(400, "UNSUPPORTED_ACTION");
    }

    return json({ ok: true, request_id: requestId, ...result });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const code = safeErrorCode(error);
    console.error("School onboarding request failed", { request_id: requestId, code });
    return json({ ok: false, request_id: requestId, error: code }, status);
  }
});
