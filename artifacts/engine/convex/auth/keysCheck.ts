/**
 * The deploy's post-push check (deploy.yml smoke test): the auth config just pushed verifies tokens signed with the
 * deployment's keys. Throws (so `npx convex run` fails the deploy) with the problems, which never quote a value.
 */
import { internalAction } from "../_generated/server";
import authConfig from "../auth.config";
import { mintPlayerJwt } from "./jwt";
import { deployedKeyProblems } from "./keyAgreement";

export const deployed = internalAction({
  args: {},
  handler: async () => {
    const { token } = await mintPlayerJwt({ subject: "deploy-check", credentialId: "deploy-check", permission: "read" }, 60);
    const problems = await deployedKeyProblems(authConfig.providers, token, {
      BETTER_AUTH_JWKS: process.env.BETTER_AUTH_JWKS || undefined, BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || undefined,
    });
    if (problems.length) throw new Error(problems.join("; "));
    return "auth keys verify against the deployed auth config";
  },
});
