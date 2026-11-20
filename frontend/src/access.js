const ACTIVE = "active";

export function buildAccessContexts({
  membershipRoles = [],
  roles = [],
  rolePermissions = [],
  permissions = [],
  tenantMemberships = [],
  schoolMemberships = [],
  tenants = [],
  schools = [],
}) {
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const permissionById = new Map(permissions.map((permission) => [permission.id, permission.key]));
  const permissionIdsByRole = new Map();
  for (const row of rolePermissions) {
    const values = permissionIdsByRole.get(row.role_id) ?? [];
    const key = permissionById.get(row.permission_id);
    if (key) values.push(key);
    permissionIdsByRole.set(row.role_id, values);
  }

  const activeTenants = new Set(
    tenantMemberships.filter((row) => row.status === ACTIVE).map((row) => row.tenant_id),
  );
  const activeSchools = new Set(
    schoolMemberships
      .filter((row) => row.status === ACTIVE)
      .map((row) => `${row.tenant_id}:${row.school_id}`),
  );
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const schoolById = new Map(schools.map((school) => [school.id, school]));

  const contexts = [];
  const seen = new Set();

  for (const assignment of membershipRoles) {
    const role = roleById.get(assignment.role_id);
    if (!role) continue;

    const tenantId = assignment.tenant_id ?? null;
    const schoolId = assignment.school_id ?? null;
    const classId = assignment.class_id ?? null;

    if (role.scope === "platform") {
      if (tenantId || schoolId || classId) continue;
    } else {
      if (!tenantId || !activeTenants.has(tenantId)) continue;
      if ((role.scope === "school" || role.scope === "class") &&
          (!schoolId || !activeSchools.has(`${tenantId}:${schoolId}`))) continue;
      if (role.scope === "class" && !classId) continue;
      if (role.scope === "tenant" && schoolId) continue;
    }

    const key = [role.id, tenantId ?? "", schoolId ?? "", classId ?? ""].join(":");
    if (seen.has(key)) continue;
    seen.add(key);

    contexts.push({
      key,
      roleId: role.id,
      roleKey: role.key,
      roleName: role.name,
      scope: role.scope,
      tenantId,
      schoolId,
      classId,
      tenantName: tenantById.get(tenantId)?.display_name ?? "",
      schoolName: schoolById.get(schoolId)?.name ?? "",
      permissions: [...new Set(permissionIdsByRole.get(role.id) ?? [])],
    });
  }

  return contexts.sort((a, b) => {
    const rank = { platform: 0, tenant: 1, school: 2, class: 3 };
    return (rank[a.scope] ?? 9) - (rank[b.scope] ?? 9)
      || a.roleName.localeCompare(b.roleName);
  });
}

export function hasPermission(context, permission) {
  return Boolean(context?.permissions?.includes(permission));
}

export function visibleSections(context) {
  const sections = ["overview", "profile"];
  const allow = (keys) => keys.some((key) => hasPermission(context, key));

  if (allow(["platform.tenants.read", "platform.tenants.manage"])) sections.push("tenants");
  if (allow(["platform.schools.read", "platform.schools.manage", "schools.read", "schools.manage"])) sections.push("schools");
  if (allow(["students.read", "students.manage"]) || ["parent", "student"].includes(context?.roleKey)) sections.push("students");
  if (allow(["teachers.read", "teachers.manage"])) sections.push("teachers");
  if (allow(["classes.read", "classes.manage"])) sections.push("classes");
  if (allow(["attendance.read", "attendance.manage"])) sections.push("attendance");
  if (allow(["assignments.read", "assignments.manage", "assignments.submit"])) sections.push("assignments");
  if (allow(["grades.read", "grades.manage"]) || ["parent", "student"].includes(context?.roleKey)) sections.push("grades");
  if (allow(["exams.read", "exams.manage"])) sections.push("exams");
  if (allow(["timetable.read", "timetable.manage"])) sections.push("timetable");
  if (allow(["content.read", "content.manage"])) sections.push("content");
  if (allow(["fees.read", "fees.manage", "fees.payments.record"]) || ["parent", "student"].includes(context?.roleKey)) sections.push("fees");
  if (allow(["support.read", "support.create", "support.manage"])) sections.push("support");
  if (allow(["conversations.read", "conversations.create", "conversations.manage"])) sections.push("messages");
  if (allow(["notifications.read", "notifications.manage"])) sections.push("notifications");
  if (allow(["fees.read", "fees.manage", "fees.payments.record"]) || ["parent", "student"].includes(context?.roleKey)) sections.push("fees");
  if (allow(["tenant.billing.read", "tenant.billing.manage", "platform.billing.manage"])) sections.push("billing");
  if (allow(["ai.read", "ai.use", "ai.manage"])) sections.push("questions");

  return [...new Set(sections)];
}

export function roleLabel(context) {
  if (!context) return "";
  const scopeLabel = {
    platform: "المنصة",
    tenant: "المؤسسة",
    school: "المدرسة",
    class: "الفصل",
  }[context.scope] ?? context.scope;
  const location = [context.tenantName, context.schoolName].filter(Boolean).join(" · ");
  return [context.roleName, location || scopeLabel].filter(Boolean).join(" — ");
}
