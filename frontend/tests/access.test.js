import test from "node:test";
import assert from "node:assert/strict";
import { buildAccessContexts, hasPermission, visibleSections } from "../src/access.js";

const catalog = {
  roles: [
    { id: "r-platform", key: "platform_admin", name: "Platform Admin", scope: "platform" },
    { id: "r-school", key: "school_admin", name: "School Admin", scope: "school" },
    { id: "r-teacher", key: "teacher", name: "Teacher", scope: "class" },
    { id: "r-parent", key: "parent", name: "Parent", scope: "school" },
  ],
  permissions: [
    { id: "p-platform", key: "platform.tenants.read" },
    { id: "p-students", key: "students.read" },
    { id: "p-assignments", key: "assignments.manage" },
    { id: "p-attendance", key: "attendance.manage" },
    { id: "p-messages", key: "conversations.read" },
    { id: "p-fees", key: "fees.read" },
  ],
  rolePermissions: [
    { role_id: "r-platform", permission_id: "p-platform" },
    { role_id: "r-school", permission_id: "p-students" },
    { role_id: "r-school", permission_id: "p-attendance" },
    { role_id: "r-teacher", permission_id: "p-assignments" },
    { role_id: "r-parent", permission_id: "p-messages" },
    { role_id: "r-parent", permission_id: "p-fees" },
  ],
};

test("platform roles require a platform-only assignment and are not inferred from a user choice", () => {
  const contexts = buildAccessContexts({
    ...catalog,
    membershipRoles: [
      { role_id: "r-platform" },
      { role_id: "r-platform", tenant_id: "tenant-1" },
    ],
  });
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].scope, "platform");
  assert.deepEqual(contexts[0].permissions, ["platform.tenants.read"]);
});

test("inactive tenant or school memberships do not produce accessible contexts", () => {
  const contexts = buildAccessContexts({
    ...catalog,
    membershipRoles: [
      { role_id: "r-school", tenant_id: "tenant-1", school_id: "school-1" },
      { role_id: "r-school", tenant_id: "tenant-2", school_id: "school-2" },
    ],
    tenantMemberships: [
      { tenant_id: "tenant-1", status: "active" },
      { tenant_id: "tenant-2", status: "suspended" },
    ],
    schoolMemberships: [
      { tenant_id: "tenant-1", school_id: "school-1", status: "revoked" },
      { tenant_id: "tenant-2", school_id: "school-2", status: "active" },
    ],
  });
  assert.deepEqual(contexts, []);
});

test("school and class contexts are tied to active tenant and school membership", () => {
  const contexts = buildAccessContexts({
    ...catalog,
    membershipRoles: [
      { role_id: "r-school", tenant_id: "tenant-1", school_id: "school-1" },
      { role_id: "r-teacher", tenant_id: "tenant-1", school_id: "school-1", class_id: "class-1" },
    ],
    tenantMemberships: [{ tenant_id: "tenant-1", status: "active" }],
    schoolMemberships: [{ tenant_id: "tenant-1", school_id: "school-1", status: "active" }],
    tenants: [{ id: "tenant-1", display_name: "Verified tenant" }],
    schools: [{ id: "school-1", tenant_id: "tenant-1", name: "Verified school" }],
  });
  assert.equal(contexts.length, 2);
  assert.equal(contexts[0].tenantName, "Verified tenant");
  assert.equal(contexts[0].schoolName, "Verified school");
  assert.equal(contexts[1].classId, "class-1");
});

test("permissions are derived only from role_permissions", () => {
  const [context] = buildAccessContexts({
    ...catalog,
    membershipRoles: [{ role_id: "r-teacher", tenant_id: "tenant-1", school_id: "school-1", class_id: "class-1" }],
    tenantMemberships: [{ tenant_id: "tenant-1", status: "active" }],
    schoolMemberships: [{ tenant_id: "tenant-1", school_id: "school-1", status: "active" }],
  });
  assert.equal(hasPermission(context, "assignments.manage"), true);
  assert.equal(hasPermission(context, "students.manage"), false);
});

test("parent and student workspaces expose only self-service sections plus granted permissions", () => {
  const [context] = buildAccessContexts({
    ...catalog,
    membershipRoles: [{ role_id: "r-parent", tenant_id: "tenant-1", school_id: "school-1" }],
    tenantMemberships: [{ tenant_id: "tenant-1", status: "active" }],
    schoolMemberships: [{ tenant_id: "tenant-1", school_id: "school-1", status: "active" }],
  });
  const sections = visibleSections(context);
  assert.ok(sections.includes("students"));
  assert.ok(sections.includes("grades"));
  assert.ok(sections.includes("fees"));
  assert.ok(sections.includes("messages"));
  assert.equal(sections.includes("tenants"), false);
  assert.equal(sections.includes("attendance"), false);
  assert.equal(sections.includes("billing"), false);
});

test("contexts with duplicate role assignments do not create duplicate switcher options", () => {
  const assignments = [
    { role_id: "r-school", tenant_id: "tenant-1", school_id: "school-1" },
    { role_id: "r-school", tenant_id: "tenant-1", school_id: "school-1" },
  ];
  const contexts = buildAccessContexts({
    ...catalog,
    membershipRoles: assignments,
    tenantMemberships: [{ tenant_id: "tenant-1", status: "active" }],
    schoolMemberships: [{ tenant_id: "tenant-1", school_id: "school-1", status: "active" }],
  });
  assert.equal(contexts.length, 1);
});
