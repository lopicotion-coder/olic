import test from "node:test";
import assert from "node:assert/strict";
import { acceptPendingMemberships } from "../src/membership-acceptance.js";

function fakeClient(results = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        update(values) {
          const call = { table, values, filters: [] };
          calls.push(call);
          return {
            eq(column, value) {
              call.filters.push([column, value]);
              return {
                eq(nextColumn, nextValue) {
                  call.filters.push([nextColumn, nextValue]);
                  return Promise.resolve(results[table] ?? { data: [], error: null });
                },
              };
            },
          };
        },
      };
    },
  };
}

test("accepts only the signed-in user's pending tenant and school invitations", async () => {
  const client = fakeClient();
  await acceptPendingMemberships(client, "user-123");

  assert.deepEqual(client.calls.map((call) => call.table).sort(), [
    "school_memberships",
    "tenant_memberships",
  ]);
  for (const call of client.calls) {
    assert.deepEqual(call.values, { status: "active" });
    assert.deepEqual(call.filters, [
      ["user_id", "user-123"],
      ["status", "invited"],
    ]);
  }
});

test("rejects empty or absent user ids before issuing database writes", async () => {
  const client = fakeClient();
  await assert.rejects(() => acceptPendingMemberships(client, ""), /authenticated user id/);
  assert.equal(client.calls.length, 0);
});

test("surfaces membership acceptance errors instead of silently loading an empty workspace", async () => {
  const client = fakeClient({
    school_memberships: { data: null, error: { message: "RLS denied" } },
  });

  await assert.rejects(
    () => acceptPendingMemberships(client, "user-123"),
    /Could not accept school invitation: RLS denied/,
  );
});
