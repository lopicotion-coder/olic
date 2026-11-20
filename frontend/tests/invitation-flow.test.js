import test from "node:test";
import assert from "node:assert/strict";
import {
  isInvitationCallback,
  isPendingInvitationUser,
} from "../src/invitation-flow.js";

test("detects an implicit invite callback with a verified invite type", () => {
  assert.equal(
    isInvitationCallback("?invite=1", "#access_token=token&type=invite"),
    true,
  );
});

test("detects a PKCE invite callback with a code query parameter", () => {
  assert.equal(
    isInvitationCallback("?invite=1&code=one-time-code", ""),
    true,
  );
});

test("does not treat ordinary authentication links as invitation callbacks", () => {
  assert.equal(isInvitationCallback("", "#access_token=token&type=recovery"), false);
  assert.equal(isInvitationCallback("?invite=0", "#access_token=token&type=invite"), false);
  assert.equal(isInvitationCallback("?code=one-time-code", ""), false);
  assert.equal(isInvitationCallback("?invite=1", "#error=access_denied"), false);
});

test("uses only the invite UX marker and not arbitrary metadata values", () => {
  assert.equal(isPendingInvitationUser({ user_metadata: { myschool_invite: true } }), true);
  assert.equal(isPendingInvitationUser({ user_metadata: { myschool_invite: false } }), false);
  assert.equal(isPendingInvitationUser({ user_metadata: { role: "school_admin" } }), false);
  assert.equal(isPendingInvitationUser(null), false);
});
