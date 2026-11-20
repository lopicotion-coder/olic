const INVITED = "invited";
const ACTIVE = "active";

/**
 * Accept only invitation rows belonging to the authenticated user.
 * RLS self-accept policies remain the authorization boundary.
 */
export async function acceptPendingMemberships(client, userId) {
  if (!client || typeof client.from !== "function") {
    throw new TypeError("A Supabase client is required.");
  }
  if (typeof userId !== "string" || !userId.trim()) {
    throw new TypeError("An authenticated user id is required.");
  }

  const targets = [
    ["tenant_memberships", "tenant invitation"],
    ["school_memberships", "school invitation"],
  ];

  const results = await Promise.all(targets.map(async ([table, label]) => {
    const result = await client.from(table)
      .update({ status: ACTIVE })
      .eq("user_id", userId)
      .eq("status", INVITED);
    if (result.error) {
      throw new Error(`Could not accept ${label}: ${result.error.message ?? "database update failed"}`);
    }
    return result.data ?? null;
  }));

  return { tenant: results[0], school: results[1] };
}
