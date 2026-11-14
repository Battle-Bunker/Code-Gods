/**
 * `pnpm player` end to end against the live local backend: the device flow (approved by the human through
 * account.approveConnection, as the /device page does), then generated commands over /mcp as that human.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRemoteCli } from "@workspace/v2-affordances/remote";
import { admin, humans, SITE_ } from "./v2-helpers.ts";

test("connect, approve, call, disconnect", async () => {
  const [owner, player] = await humans("Owner", "Player");
  const { roomId } = await admin.mutation("v2/testing:seedGame", { owner: owner!.userId, humans: [player!.userId], practice: 1 });
  const out: string[] = [], err: string[] = [];
  let approved = false;
  const env = {
    io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, fetch, defaultSite: SITE_,
    configPath: join(mkdtempSync(join(tmpdir(), "cg-cli-")), "cli.json"),
    sleep: async () => {
      if (approved) return;
      const code = /approve code (\S+)/.exec(out.join("\n"))?.[1];
      assert.ok(code, out.join("\n"));
      const res = await player!.mutation("v2/ops/account:approveConnection", { args: { request: code, grant: "act" } });
      assert.equal(res.ok, true, JSON.stringify(res));
      approved = true;
    },
  };
  assert.equal(await runRemoteCli(["connect", "--room", roomId], env), 0, err.join("\n"));
  assert.equal(await runRemoteCli(["status"], env), 0, err.join("\n"));
  assert.match(out.at(-1)!, /act rights: \d+ tools offered now\./);
  assert.equal(await runRemoteCli(["chat", "send", "--text", "from the CLI"], env), 0, err.join("\n"));
  assert.equal(await runRemoteCli(["game", "end"], env), 1, "an act grant is refused owner tools");
  assert.match(err.at(-1)!, /needs the owner permission/);
  assert.equal(await runRemoteCli(["disconnect"], env), 0);
  assert.equal(await runRemoteCli(["status"], env), 2);
});
