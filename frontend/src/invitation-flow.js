export function isInvitationCallback(search = "", hash = "") {
  const queryText = String(search).replace(/^\?/, "");
  const hashText = String(hash).replace(/^#/, "");
  const query = new URLSearchParams(queryText);
  const fragment = new URLSearchParams(hashText);

  return query.get("invite") === "1" && (
    fragment.get("type") === "invite" ||
    fragment.has("access_token") ||
    query.has("code")
  );
}

export function isPendingInvitationUser(user) {
  return user?.user_metadata?.myschool_invite === true;
}
