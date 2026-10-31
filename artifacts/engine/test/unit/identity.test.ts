/**
 * Identity rules (convex/auth/identity.ts and profileName.ts): pure, no backend.
 * Each test names the break it catches.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { profileName } from "../../convex/auth/profileName.ts";
import { fakeProvider, isAdminUser, tokenKind } from "../../convex/auth/identity.ts";

test("full name: Google's given + family name beat the display `name` (a nickname would hide who is playing)", () => {
  assert.equal(profileName({ given_name: "Ada", family_name: "Lovelace", name: "ada99", sub: "1" }), "Ada Lovelace");
  assert.equal(profileName({ given_name: "  Ada ", family_name: "King  Lovelace", sub: "1" }), "Ada King Lovelace", "whitespace collapsed");
  assert.equal(profileName({ name: "Ada Lovelace", sub: "1" }), "Ada Lovelace", "no split names: `name`");
  assert.equal(profileName({ given_name: "Ada", sub: "1" }), "Ada", "only a given name");
  assert.equal(profileName({ sub: "42" }), "Deity 42", "nothing at all");
  assert.equal(profileName({ given_name: "A".repeat(200), family_name: "B" }).length, 160, "bounded");
});

const env = (extra: Record<string, string | undefined> = {}) => ({ CODE_GODS_ADMIN_EMAILS: "boss@example.org, Other@Example.org", ...extra });
const user = (over: Partial<{ email: string; emailVerified: boolean; provider: string }> = {}) =>
  ({ email: "boss@example.org", emailVerified: true, provider: "google", ...over });

test("admin: a verified, allowlisted Google email (case-insensitive) and nothing less", () => {
  assert.equal(isAdminUser(user(), env()), true);
  assert.equal(isAdminUser(user({ email: "OTHER@example.org" }), env()), true, "allowlist is case-insensitive");
  assert.equal(isAdminUser(user({ emailVerified: false }), env()), false, "an unverified email is anyone's claim");
  assert.equal(isAdminUser(user({ email: "intruder@example.org" }), env()), false, "not allowlisted");
  assert.equal(isAdminUser(user(), env({ CODE_GODS_ADMIN_EMAILS: "" })), false, "empty allowlist");
  assert.equal(isAdminUser(user({ provider: "github" }), env()), false, "another provider's email claim is not Google's");
  assert.equal(isAdminUser({ email: "boss@example.org", emailVerified: true }, env()), false, "no provider recorded");
});

test("admin: the fake test provider counts only while test fixtures are on", () => {
  assert.equal(isAdminUser(user({ provider: "fake" }), env()), false, "production: fake is never admin");
  assert.equal(isAdminUser(user({ provider: "fake" }), env({ CODE_GODS_TEST_FIXTURES: "1" })), true);
  assert.equal(isAdminUser(user({ provider: "fake" }), env({ CODE_GODS_DEV: "1" })), true);
});

test("the fake OIDC provider is offered only on a local deployment with fixtures on and a provider URL", () => {
  const url = "http://127.0.0.1:4099";
  assert.equal(fakeProvider({ CODE_GODS_FAKE_OIDC_URL: url }), null, "fixtures off: refused even with a URL");
  assert.equal(fakeProvider({ CODE_GODS_TEST_FIXTURES: "1" }), null, "no URL");
  assert.equal(fakeProvider({ CODE_GODS_TEST_FIXTURES: "0", CODE_GODS_FAKE_OIDC_URL: url }), null, "only \"1\" switches fixtures on");
  assert.deepEqual(fakeProvider({ CODE_GODS_TEST_FIXTURES: "1", CODE_GODS_FAKE_OIDC_URL: `${url}/` }),
    { providerId: "fake", discoveryUrl: `${url}/.well-known/openid-configuration`, clientId: "code-gods-local" });
  assert.equal(fakeProvider({ CODE_GODS_DEV: "1", CODE_GODS_FAKE_OIDC_URL: url })?.providerId, "fake");
});

test("token kinds are told apart by issuer, exactly", () => {
  const site = "https://dep.convex.site";
  assert.equal(tokenKind(site, site), "browser");
  assert.equal(tokenKind(`${site}/api/device`, site), "player");
  assert.equal(tokenKind(`${site}/`, `${site}/`), "browser", "trailing slashes ignored");
  assert.equal(tokenKind("https://evil.example", site), null);
  assert.equal(tokenKind(`${site}.evil.example/api/device`, site), null, "prefix trick");
  assert.equal(tokenKind(`${site}/api/device/x`, site), null);
  assert.equal(tokenKind(undefined, site), null);
});
