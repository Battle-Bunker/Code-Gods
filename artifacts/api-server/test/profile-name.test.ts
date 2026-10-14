import test from "node:test";
import assert from "node:assert/strict";
import { profileName } from "../src/lib/profile-name.ts";

test("combines Replit first and last names even if name contains only first name", () => {
  assert.equal(profileName({ first_name: "Alex", last_name: "North", name: "Alex" }), "Alex North");
  assert.equal(profileName({ first_name: "Alex", last_name: "South" }), "Alex South");
});
test("supports standard OIDC names and full-name-only profiles", () => {
  assert.equal(profileName({ given_name: " Alex ", family_name: "North" }), "Alex North");
  assert.equal(profileName({ name: "Alex North" }), "Alex North");
  assert.equal(profileName({ first_name: "Alex", name: "Alex North" }), "Alex North");
});
test("missing surnames do not create undefined labels", () => {
  assert.equal(profileName({ first_name: "Alex" }), "Alex");
  assert.equal(profileName({ preferred_username: "alex-north" }), "alex-north");
});
