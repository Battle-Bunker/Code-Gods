import { test } from "node:test";
import assert from "node:assert/strict";
import { dockGroups, EMPTY_VIEW, parseDock } from "@workspace/v2-affordances";
import { closePlan, columns, defaultPanes, keepShown, dockFor, openPlan, PANE_IDS, PANES, paneTitle, readingOrder, shownPanes, storedPane, storedSlugOf, filePane, fileIdOf } from "../src/panels.ts";

test("a stored panel opens as a pane of its own in every phase, and keeps its slug", () => {
  // Catches: shownPanes dropping a stored panel's pane as an unknown id, so "Open as a pane" shows nothing.
  const pane = storedPane("my-stats");
  assert.equal(pane, "panel:my-stats");
  assert.equal(storedSlugOf(pane), "my-stats");
  assert.equal(storedSlugOf("objects"), null);
  assert.equal(storedSlugOf("panel:"), null);
  for (const phase of ["planning", "live", "ended", "replay"] as const) {
    const own = { panes: [...defaultPanes(phase), { pane, place: "right" as const }] };
    assert.ok(shownPanes(own, phase).some(p => p.pane === pane), phase);
  }
  assert.equal(paneTitle(pane), "my-stats");
  // The longest slug still fits the view operations' pane id.
  assert.ok(storedPane("a".repeat(48)).length <= 60);
});

test("a file panel (src/panels/*.tsx) opens as a pane of its own in every phase, and keeps its file id", () => {
  const pane = filePane("my-bits");
  assert.equal(pane, "file:my-bits");
  assert.equal(fileIdOf(pane), "my-bits");
  assert.equal(fileIdOf("panel:my-bits"), null);
  assert.equal(fileIdOf("file:"), null);
  assert.equal(storedSlugOf(pane), null);
  for (const phase of ["planning", "live", "ended", "replay"] as const) {
    assert.ok(shownPanes({ panes: [...defaultPanes(phase), { pane, place: "right" as const }] }, phase).some(p => p.pane === pane), phase);
  }
  assert.equal(paneTitle(pane), "my-bits");
});

test("the panels pane is offered in every phase", () => {
  assert.deepEqual(PANES["my-panels"].phases, ["planning", "live", "paused", "ended", "replay"]);
});

test("an empty view follows the phase's defaults; an own arrangement is kept", () => {
  assert.deepEqual(shownPanes(EMPTY_VIEW, "planning"), defaultPanes("planning"));
  const own = { panes: [{ pane: "race", place: "main" as const }] };
  assert.deepEqual(shownPanes(own, "live"), own.panes);
});

test("after the end the results are shown first even when not open", () => {
  const own = { panes: [{ pane: "objects", place: "main" as const }] };
  assert.equal(shownPanes(own, "ended")[0]!.pane, "results");
});

test("opening a pane on an empty view keeps the defaults first, and the pane joins at its home", () => {
  const ops = openPlan(EMPTY_VIEW, "planning", "public-chat");
  assert.deepEqual(ops.map(o => o.args.pane), [...defaultPanes("planning").map(p => p.pane), "public-chat", "public-chat"]);
  assert.ok(ops.every(o => o.id === "view.openPane"));
  assert.deepEqual(ops.slice(-2).map(o => o.args), [{ pane: "public-chat", place: "right" }, { pane: "public-chat" }], "joins at its home, then comes to the front");
});

test("opening a pane never closes another (round 1: One line evicted What just changed)", () => {
  const full = { panes: [...defaultPanes("live"), { pane: "object", place: "main" as const }, { pane: "public-chat", place: "right" as const }] };
  for (const pane of ["rules", "feed", "others-care", "points-over-time"]) {
    const ops = openPlan(full, "live", pane);
    assert.deepEqual(ops.map(o => o.id), ["view.openPane", "view.openPane"], pane);
  }
  assert.equal(shownPanes({ panes: [...full.panes, { pane: "rules", place: "main" }] }, "live").length, 8);
});

test("opening an open pane brings it to the front of its tab group, without opening it twice", () => {
  assert.deepEqual(openPlan({ panes: [{ pane: "race", place: "right" }] }, "live", "race"), [{ id: "view.openPane", args: { pane: "race" } }]);
});

test("the middle is never empty, and a phone reads main first", () => {
  const c = columns([{ pane: "feed", place: "right" }, { pane: "agents", place: "bottom" }]);
  assert.deepEqual(c.main, ["feed"]);
  // The owner's order on a phone (17 November): the goal, the lines, the agents, the leaderboard, the assistant.
  assert.deepEqual(readingOrder(defaultPanes("live")), ["my-card", "objects", "agents", "race", "assistant"]);
});

test("an arrangement made in planning is the player's on the live screen too (one default for both)", () => {
  const planning = { panes: [{ pane: "forge", place: "main" as const }, { pane: "my-card", place: "left" as const }] };
  const live = shownPanes(planning, "live").map(p => p.pane);
  assert.deepEqual(live, ["forge", "my-card"], "the player's own arrangement wins");
  assert.ok(!shownPanes(planning, "ended").some(p => p.pane === "forge"), "no forge after the end");
});

test("a pane an assistant opened on an empty view joins the phase's defaults instead of replacing them", () => {
  // Catches: the assistant's view_openPane (stored on the server from the empty view) leaving only that pane on screen.
  const opened = { panes: [{ pane: "rules", place: "main" as const }] };
  assert.deepEqual(shownPanes(opened, "planning").map(p => p.pane), [...defaultPanes("planning").map(p => p.pane), "rules"]);
  const live = shownPanes(opened, "live");
  assert.deepEqual(live.map(p => p.pane), [...defaultPanes("live").map(p => p.pane), "rules"], "the pane asked for joins the defaults");
  // A human's own arrangement that keeps one default is theirs as it is.
  const own = { panes: [{ pane: "my-card", place: "main" as const }, { pane: "rules", place: "left" as const }] };
  assert.deepEqual(shownPanes(own, "planning"), own.panes);
});

test("an arrangement made after a game's end meets the planning defaults when the next game starts", () => {
  // Catches: the next game's planning without the agent code (the arrangement kept the last game's results screen).
  const ended = { panes: [{ pane: "results", place: "main" as const }, { pane: "my-card", place: "left" as const }, { pane: "assistant", place: "right" as const }] };
  const planning = shownPanes(ended, "planning").map(p => p.pane);
  for (const d of defaultPanes("planning")) assert.ok(planning.includes(d.pane), d.pane);
  assert.ok(planning.includes("assistant"), "the assistant is in the one default");
});

test("every stored pane shows: nothing is dropped to make room", () => {
  const panes = ["objects", "my-card", "feed", "agents", "race", "rules"].map(pane => ({ pane, place: "main" as const }));
  assert.deepEqual(shownPanes({ panes }, "live").map(p => p.pane), ["objects", "my-card", "feed", "agents", "race", "rules"]);
});

test("an arrangement made during a game meets the planning defaults when the next game starts", () => {
  // Catches: the next game's planning without the agent code, from an arrangement made while the world ran.
  const live = { panes: [...defaultPanes("live"), { pane: "public-chat", place: "right" as const }] };
  const planning = shownPanes(live, "planning").map(p => p.pane);
  for (const d of defaultPanes("planning")) assert.ok(planning.includes(d.pane), d.pane);
});

test("closing a default pane keeps the other defaults", () => {
  const ops = closePlan({ panes: [] }, "live", "race");
  assert.deepEqual(ops.at(-1), { id: "view.closePane", args: { pane: "race" } });
  assert.equal(ops.filter(o => o.id === "view.openPane").length, defaultPanes("live").length);
  assert.deepEqual(closePlan({ panes: defaultPanes("live") }, "live", "race"), [{ id: "view.closePane", args: { pane: "race" } }], "stored panes are not closed and reopened (their dock place stays)");
});

test("moving an open pane is one move", () => {
  const view = { panes: defaultPanes("live") };
  assert.deepEqual(openPlan(view, "live", "agents", "left"), [{ id: "view.movePane", args: { pane: "agents", place: "left" } }]);
});

test("the others-care, points-over-time and rules panes are offered where they have something to show", () => {
  assert.deepEqual(PANES["others-care"].phases, ["live", "paused", "ended", "replay"]);
  assert.deepEqual(PANES["points-over-time"].phases, ["live", "paused", "ended", "replay"]);
  assert.deepEqual(PANES.rules.phases, ["planning", "live", "paused", "ended", "replay"]);
  for (const id of PANE_IDS) assert.doesNotMatch(`${PANES[id].title} ${PANES[id].blurb}`, /\b(payoff|objects?|grids?)\b/i, id);
});

test("the assistant pane is offered in every phase, so a player can ask for help before, during and after a game", () => {
  assert.ok(PANE_IDS.includes("assistant"));
  assert.deepEqual(PANES.assistant.phases, ["planning", "live", "paused", "ended", "replay"]);
});

test("in a replay the replay's own entry is never drawn, the replay's defaults show, and the results do not lead", () => {
  // Catches (the owner, 17 November): an ended game's replay without v1's Timeline in the assistant's place, or
  // without the rest of the owner's layout (goal over leaderboard, lines, my agents).
  // Catches: the replay pane (replay.open adds it) taking the whole screen, or the results pane covering the playhead.
  const opened = { panes: [{ pane: "replay", place: "main" as const }] };
  assert.deepEqual(shownPanes(opened, "replay"), defaultPanes("replay"));
  const panes = defaultPanes("replay").map(p => p.pane);
  assert.deepEqual(defaultPanes("replay"), [
    { pane: "my-card", place: "main" }, { pane: "objects", place: "main" }, { pane: "agents", place: "right" },
    { pane: "race", place: "right" }, { pane: "timeline", place: "bottom" },
  ]);
  assert.ok(!panes.includes("assistant"), panes.join());
  const own = { panes: [{ pane: "replay", place: "main" as const }, { pane: "race", place: "main" as const }] };
  assert.deepEqual(shownPanes(own, "replay"), [{ pane: "race", place: "main" }, { pane: "timeline", place: "bottom" }]);
  // Coming from the live game (the owner's layout stored), the Timeline takes the assistant's place; the stored
  // assistant is neither closed nor joined by a stored Timeline, so the next game still has its assistant.
  const fromLive = { panes: defaultPanes("live") };
  assert.deepEqual(shownPanes(fromLive, "replay"), defaultPanes("replay"));
  assert.deepEqual(keepShown(fromLive, "replay"), []);
  for (const id of ["forge", "overview"] as const) assert.ok(!PANES[id].phases.includes("replay"), `${id} has nothing to show in a replay`);
  assert.deepEqual(PANES.timeline.phases, ["replay"], "the Timeline is the replay's only");
  // The results stay reachable in the replay from the pane menu and the palette, never opened over the playhead.
  assert.ok(PANES.results.phases.includes("replay"));
  assert.ok(!shownPanes({ panes: [{ pane: "results", place: "main" }] }, "replay").some(p => p.pane === "results"));
});

test("arranging panes in a replay keeps the replay open", () => {
  // Catches: keepShown closing the replay's entry (view.closePane "replay" ends the replay) when a pane is opened.
  const opened = { panes: [{ pane: "replay", place: "main" as const }] };
  for (const ops of [openPlan(opened, "replay", "public-chat"), closePlan(opened, "replay", "race")]) {
    assert.ok(!ops.some(o => o.args.pane === "replay"), JSON.stringify(ops));
  }
  const arranged = { panes: [{ pane: "replay", place: "main" as const }, ...defaultPanes("replay")] };
  assert.deepEqual(closePlan(arranged, "replay", "feed"), [{ id: "view.closePane", args: { pane: "feed" } }], "an arrangement equal to what is shown needs no other ops");
});

test("opening one line keeps every pane", () => {
  assert.deepEqual(openPlan({ panes: defaultPanes("live") }, "live", "object"), [{ id: "view.openPane", args: { pane: "object", place: "main" } }, { id: "view.openPane", args: { pane: "object" } }]);
});

test("an assistant in front in planning is in front when the world starts (re-walk: it landed behind a tab)", () => {
  const panes = [{ pane: "my-card", place: "main" as const }, { pane: "forge", place: "right" as const }, { pane: "assistant", place: "right" as const }, { pane: "overview", place: "left" as const }];
  const front = { ...EMPTY_VIEW, panes, dock: { planning: parseDock("row(overview 25, my-card 40, forge|*assistant 35)") } };
  const groupOf = (v: typeof front) => dockGroups(dockFor(v, "live")!).find(l => l.group.tabs.includes("assistant"))!.group;
  assert.equal(groupOf(front).active, "assistant");
  // The live screen's default gives the assistant a row of its own (the owner's layout), so it is in front there anyway.
  const behind = { ...front, dock: { planning: parseDock("row(overview 25, my-card 40, *forge|assistant 35)") } };
  assert.equal(groupOf(behind).active, "assistant");
});

test("pane blurbs fit every game: none says “a line” (the palette showed it in a grid game)", () => {
  for (const id of PANE_IDS) assert.doesNotMatch(PANES[id].blurb ?? "", /\ba line\b/, id);
});

test("planning shows the board (W3 #931: the starting objects are born, valued and scored at game start)", () => {
  for (const id of ["objects", "object", "what-if"] as const) assert.ok(PANES[id].phases.includes("planning"), id);
  assert.ok(defaultPanes("planning").some(p => p.pane === "objects" && p.place === "main"), "the lines are in the middle in planning");
  // Still no act log before the world starts: nothing has moved yet. The leaderboard sits in its place, empty (the owner's
  // layout is the default of every screen).
  assert.ok(!PANES.feed.phases.includes("planning"));
  assert.ok(PANES.race.phases.includes("planning") && defaultPanes("planning").some(p => p.pane === "race"));
});
