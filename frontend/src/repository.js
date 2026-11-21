import { buildAccessContexts } from "./access.js";

function throwIfError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function readRows(query, label) {
  return throwIfError(await query, label) ?? [];
}

export async function loadAccessModel(client, user) {
  const [profileResult, tenantMemberships, schoolMemberships, assignments] = await Promise.all([
    client.from("profiles")
      .select("id,email,display_name,avatar_path,preferred_locale,timezone")
      .eq("id", user.id)
      .maybeSingle(),
    readRows(
      client.from("tenant_memberships")
        .select("tenant_id,status")
        .eq("user_id", user.id)
        .eq("status", "active"),
      "Load tenant memberships",
    ),
    readRows(
      client.from("school_memberships")
        .select("tenant_id,school_id,status")
        .eq("user_id", user.id)
        .eq("status", "active"),
      "Load school memberships",
    ),
    readRows(
      client.from("membership_roles")
        .select("id,role_id,tenant_id,school_id,class_id")
        .eq("user_id", user.id),
      "Load assigned roles",
    ),
  ]);

  if (profileResult.error) throw new Error(`Load profile: ${profileResult.error.message}`);
  if (!assignments.length) {
    return {
      profile: profileResult.data,
      contexts: [],
      tenants: [],
      schools: [],
      tenantMemberships,
      schoolMemberships,
    };
  }

  const roleIds = [...new Set(assignments.map((row) => row.role_id))];
  const roles = await readRows(
    client.from("roles").select("id,key,name,scope").in("id", roleIds),
    "Load role definitions",
  );
  const rolePermissions = await readRows(
    client.from("role_permissions").select("role_id,permission_id").in("role_id", roleIds),
    "Load role permissions",
  );
  const permissionIds = [...new Set(rolePermissions.map((row) => row.permission_id))];
  const permissions = permissionIds.length
    ? await readRows(
        client.from("permissions").select("id,key").in("id", permissionIds),
        "Load permission definitions",
      )
    : [];

  const tenantIds = [...new Set(tenantMemberships.map((row) => row.tenant_id))];
  const schoolIds = [...new Set(schoolMemberships.map((row) => row.school_id))];

  let tenants = tenantIds.length
    ? await readRows(
        client.from("tenants").select("id,display_name,slug,status").in("id", tenantIds),
        "Load accessible organizations",
      )
    : [];
  let schools = schoolIds.length
    ? await readRows(
        client.from("schools").select("id,tenant_id,name,slug,status,default_locale,timezone").in("id", schoolIds),
        "Load accessible schools",
      )
    : [];

  const firstPass = buildAccessContexts({
    membershipRoles: assignments,
    roles,
    rolePermissions,
    permissions,
    tenantMemberships,
    schoolMemberships,
    tenants,
    schools,
  });

  if (firstPass.some((ctx) => ctx.permissions.includes("platform.tenants.read"))) {
    tenants = await readRows(
      client.from("tenants").select("id,display_name,slug,status").order("display_name"),
      "Load platform organizations",
    );
  }

  if (firstPass.some((ctx) => ctx.permissions.includes("platform.schools.read"))) {
    schools = await readRows(
      client.from("schools").select("id,tenant_id,name,slug,status,default_locale,timezone").order("name"),
      "Load platform schools",
    );
  } else {
    const manageableTenantIds = [...new Set(firstPass
      .filter((ctx) => ["schools.read","schools.manage","students.manage","teachers.manage","classes.manage","attendance.manage","assignments.manage"].some((key) => ctx.permissions.includes(key)))
      .map((ctx) => ctx.tenantId)
      .filter(Boolean))];
    if (manageableTenantIds.length) {
      schools = await readRows(
        client.from("schools").select("id,tenant_id,name,slug,status,default_locale,timezone")
          .in("tenant_id", manageableTenantIds).order("name"),
        "Load schools in assigned organizations",
      );
    }
  }

  const contexts = buildAccessContexts({
    membershipRoles: assignments,
    roles,
    rolePermissions,
    permissions,
    tenantMemberships,
    schoolMemberships,
    tenants,
    schools,
  });

  return { profile: profileResult.data, contexts, tenants, schools, tenantMemberships, schoolMemberships };
}

export function scopedQuery(client, table, columns, context, options = {}) {
  let query = client.from(table).select(columns, options.selectOptions ?? {});
  if (context?.tenantId && options.tenant !== false && hasColumn(options, "tenant_id")) {
    query = query.eq("tenant_id", context.tenantId);
  }
  if (context?.schoolId && options.school !== false && hasColumn(options, "school_id")) {
    query = query.eq("school_id", context.schoolId);
  }
  if (context?.classId && options.classScope && hasColumn(options, "class_id")) {
    query = query.eq("class_id", context.classId);
  }
  if (options.order) query = query.order(options.order, { ascending: options.ascending ?? false });
  if (options.limit) query = query.limit(options.limit);
  return query;
}

function hasColumn(options, key) {
  return !Array.isArray(options.excludeColumns) || !options.excludeColumns.includes(key);
}

export async function fetchScoped(client, table, columns, context, options = {}) {
  return readRows(scopedQuery(client, table, columns, context, options), `Load ${table}`);
}

export async function countScoped(client, table, context, options = {}) {
  let query = client.from(table).select("id", { count: "exact", head: true });
  if (context?.tenantId && options.tenant !== false) query = query.eq("tenant_id", context.tenantId);
  if (context?.schoolId && options.school !== false) query = query.eq("school_id", context.schoolId);
  if (context?.classId && options.classScope) query = query.eq("class_id", context.classId);
  const result = await query;
  if (result.error) return { count: null, error: result.error.message };
  return { count: result.count ?? 0, error: null };
}

export async function fetchMyStudentRecords(client, userId) {
  return readRows(
    client.from("students")
      .select("id,tenant_id,school_id,student_number,first_name,middle_name,last_name,date_of_birth,admission_date,status")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false }),
    "Load your student records",
  );
}

export async function fetchGuardianStudentRecords(client, userId) {
  const guardians = await readRows(
    client.from("guardians")
      .select("id,tenant_id,school_id")
      .eq("profile_id", userId),
    "Load linked guardian records",
  );
  if (!guardians.length) return [];
  const guardianIds = guardians.map((row) => row.id);
  const links = await readRows(
    client.from("student_guardians")
      .select("student_id,tenant_id,school_id,relationship,is_primary")
      .in("guardian_id", guardianIds),
    "Load linked student relationships",
  );
  const ids = [...new Set(links.map((row) => row.student_id))];
  if (!ids.length) return [];
  return readRows(
    client.from("students")
      .select("id,tenant_id,school_id,student_number,first_name,middle_name,last_name,date_of_birth,admission_date,status")
      .in("id", ids)
      .order("created_at", { ascending: false }),
    "Load linked students",
  );
}
