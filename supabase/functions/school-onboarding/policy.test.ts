import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  canInviteSchoolRole,
  hasScopedPermission,
  normalizeEmail,
  normalizeSchoolRole,
  normalizeSlug,
  schoolRoleScope,
  uniqueIds,
  validateRosterPayload,
} from "./policy.ts";

const tenantContext = {
  assignments: [{
    tenant_id: "tenant-1",
    school_id: null,
    class_id: null,
    scope: "tenant",
    permissions: ["users.manage", "schools.manage"],
  }],
  tenantMemberships: [{ tenant_id: "tenant-1", status: "active" }],
  schoolMemberships: [],
};

Deno.test("normalizes email and slug before any Auth or DB write", () => {
  assertEquals(normalizeEmail("  TEACHER@EXAMPLE.COM "), "teacher@example.com");
  assertEquals(normalizeSlug("  Demo-School "), "demo-school");
  assertThrows(() => normalizeEmail("not-an-email"), Error, "INVALID_EMAIL");
  assertThrows(() => normalizeSlug("Invalid Slug"), Error, "INVALID_SLUG");
});

Deno.test("rejects roles outside the production school-role allowlist", () => {
  assertEquals(normalizeSchoolRole("teacher"), "teacher");
  assertEquals(schoolRoleScope("teacher"), "class");
  assertThrows(() => normalizeSchoolRole("platform_owner"), Error, "UNSUPPORTED_SCHOOL_ROLE");
  assertThrows(() => normalizeSchoolRole("assistant"), Error, "UNSUPPORTED_SCHOOL_ROLE");
});

Deno.test("tenant-level users.manage is scoped to its own active tenant", () => {
  assertEquals(hasScopedPermission(tenantContext, "users.manage", "tenant-1", "school-1"), true);
  assertEquals(hasScopedPermission(tenantContext, "users.manage", "tenant-2", "school-2"), false);
  assertEquals(hasScopedPermission({
    ...tenantContext,
    tenantMemberships: [{ tenant_id: "tenant-1", status: "invited" }],
  }, "users.manage", "tenant-1", "school-1"), false);
});

Deno.test("school-level permissions cannot cross schools or create a tenant-wide school", () => {
  const context = {
    assignments: [{
      tenant_id: "tenant-1",
      school_id: "school-1",
      class_id: null,
      scope: "school",
      permissions: ["users.manage", "schools.manage"],
    }],
    tenantMemberships: [{ tenant_id: "tenant-1", status: "active" }],
    schoolMemberships: [{ tenant_id: "tenant-1", school_id: "school-1", status: "active" }],
  };
  assertEquals(hasScopedPermission(context, "users.manage", "tenant-1", "school-1"), true);
  assertEquals(hasScopedPermission(context, "users.manage", "tenant-1", "school-2"), false);
  assertEquals(hasScopedPermission(context, "schools.manage", "tenant-1", null, null, true), false);
});

Deno.test("platform permissions remain global only for platform-scoped assignments", () => {
  const context = {
    assignments: [{
      tenant_id: null,
      school_id: null,
      class_id: null,
      scope: "platform",
      permissions: ["platform.tenants.manage", "platform.schools.manage"],
    }],
    tenantMemberships: [],
    schoolMemberships: [],
  };
  assertEquals(hasScopedPermission(context, "platform.tenants.manage", null, null), true);
  assertEquals(hasScopedPermission(context, "platform.schools.manage", "tenant-1", "school-1"), true);
});

Deno.test("normalizes unique UUID lists and rejects invalid identifiers", () => {
  const first = "11111111-1111-4111-8111-111111111111";
  const second = "22222222-2222-4222-8222-222222222222";
  assertEquals(uniqueIds([first, second, first]), [first, second]);
  assertThrows(() => uniqueIds(["not-a-uuid"]), Error, "INVALID_ID_LIST");
});

Deno.test("teacher must receive at least one class-scoped role", () => {
  assertThrows(() => validateRosterPayload(
    "teacher",
    { first_name: "A", last_name: "B" },
    [],
    [],
  ), Error, "TEACHER_REQUIRES_CLASS_ASSIGNMENT");
  validateRosterPayload("teacher", { first_name: "A", last_name: "B" }, [
    "11111111-1111-4111-8111-111111111111",
  ], []);
});

Deno.test("parent must be linked to one or more students in the same school", () => {
  assertThrows(() => validateRosterPayload(
    "parent",
    { first_name: "A", last_name: "B", relationship: "mother" },
    [],
    [],
  ), Error, "PARENT_REQUIRES_STUDENT_LINK");
  validateRosterPayload("parent", { first_name: "A", last_name: "B", relationship: "mother" }, [], [
    "11111111-1111-4111-8111-111111111111",
  ]);
});

Deno.test("school administrators cannot grant another school-owner or school-admin role", () => {
  const schoolAdmin = {
    assignments: [{
      tenant_id: "tenant-1",
      school_id: "school-1",
      class_id: null,
      scope: "school",
      permissions: ["users.manage"],
    }],
    tenantMemberships: [{ tenant_id: "tenant-1", status: "active" }],
    schoolMemberships: [{ tenant_id: "tenant-1", school_id: "school-1", status: "active" }],
  };
  assertEquals(canInviteSchoolRole(schoolAdmin, "student", "tenant-1", "school-1"), true);
  assertEquals(canInviteSchoolRole(schoolAdmin, "teacher", "tenant-1", "school-1"), true);
  assertEquals(canInviteSchoolRole(schoolAdmin, "school_admin", "tenant-1", "school-1"), false);
  assertEquals(canInviteSchoolRole(schoolAdmin, "school_owner", "tenant-1", "school-1"), false);

  const tenantOwner = {
    assignments: [{
      tenant_id: "tenant-1",
      school_id: null,
      class_id: null,
      scope: "tenant",
      permissions: ["users.manage"],
    }],
    tenantMemberships: [{ tenant_id: "tenant-1", status: "active" }],
    schoolMemberships: [],
  };
  assertEquals(canInviteSchoolRole(tenantOwner, "school_admin", "tenant-1", "school-1"), true);
  assertEquals(canInviteSchoolRole(tenantOwner, "school_owner", "tenant-1", "school-1"), true);
});
