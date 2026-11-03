"use node";
/**
 * What the settings manifest (convex/manifest.ts) needs from the calibration files and @workspace/game-utilities,
 * computed here and stored: object types with parameters, classes and the PLAYABLE instantiations (every one the type
 * can instantiate, minus retired shapes: game-utilities playableInstantiations, the list the settings model is given on
 * the server), each saying how its first game here goes (`prepare`: how many rule tables would be computed on demand,
 * and about how long that takes; none for a shape whose tables are shipped or analytic) and the priors under which the
 * Aligned Lottery has measured synergy for it (`synergy`). `offered` keeps the shapes whose every table is shipped, for
 * diagnostics. Game setups are a table of their own (convex/setups.ts).
 *
 * - `refresh` (internal): recompute and store (a write only when it changed). Run by every deploy and calibration
 *   upload (scripts/upload-calibration.mjs, which the deploy workflow and the dev script run).
 * - `warm` (action): what the app calls once per signed-in session. It schedules the agent sandboxes' warm-up (so a
 *   start finds them ready; throttled deployment-wide by runtime/readiness.ts) and refreshes the stored manifest.
 *   Reading the manifest never does either (a read has no side effects).
 */
import { OBJECT_TYPES, instanceInfo, type Instantiation } from "@workspace/game-types";
import { LANGUAGES } from "@workspace/game-core";
import { analyticFor, coverage, firstUseSeconds, offeredInstantiations, playableInstantiations, synergyFor, type CalibrationManifest } from "@workspace/game-utilities";
import { action, internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { calibrationManifest, forgetCalibrationIndex } from "../engine/calibration";
import { priorIds } from "../engine/node";
import { ensureSandboxes } from "../engine/runtime";

const shape = (inst: Instantiation) => {
  const info = instanceInfo(inst);
  return { key: inst.key, args: inst.args, label: info.label, badges: info.badges, classes: inst.classes };
};
/** How a first game on `inst` goes on this deployment: the dealable draws with no shipped or analytic table. */
function prepareOf(calibration: CalibrationManifest, inst: Instantiation) {
  const toCompute = coverage(calibration, inst).missing.filter(m => !analyticFor(m.familyId, m.params, inst)).length;
  return toCompute ? { toCompute, seconds: firstUseSeconds(inst) } : null;
}

/** The stored part of the manifest (convex/manifest.ts adds what queries can read themselves), as stored. */
const bodies = new WeakMap<CalibrationManifest, string>();
function computed(calibration: CalibrationManifest): string {
  // Per calibration manifest: engine/calibration.ts keeps the same object while the stored files are unchanged.
  let body = bodies.get(calibration);
  if (body === undefined) bodies.set(calibration, body = JSON.stringify(compute(calibration)));
  return body;
}
function compute(calibration: CalibrationManifest) {
  return {
    objectTypes: OBJECT_TYPES.map(T => ({
      id: T.id, label: T.label, emoji: T.emoji, kid: T.kid, params: T.params, defaults: T.defaults,
      classes: T.classes.map(c => ({ id: c.id, slot: c.slot, superclasses: c.superclasses, badge: c.badge })),
      // The same list the settings model is given on the server (engine/settingsDomain.ts).
      playable: playableInstantiations(T.id).map(inst => ({ ...shape(inst), prepare: prepareOf(calibration, inst), synergy: priorIds(calibration).filter(p => synergyFor(inst, p)) })),
      // Diagnostics: the shapes whose every dealable table is shipped in file storage.
      offered: offeredInstantiations(calibration, T.id).map(shape),
    })),
    priors: priorIds(calibration),
  };
}

/** Store the manifest of the calibration files as they are now (never this process's older index: it could overwrite a newer refresh). */
async function store(ctx: ActionCtx): Promise<boolean> {
  forgetCalibrationIndex();
  return ctx.runMutation(internal.manifest.store, { body: computed(await calibrationManifest(ctx)) });
}

export const refresh = internalAction({
  args: {},
  handler: async (ctx): Promise<{ changed: boolean }> => {
    return { changed: await store(ctx) };
  },
});

export const warm = action({
  args: {},
  handler: async (ctx) => {
    // Signed-in callers only: an anonymous visitor must not boot sandboxes.
    await ctx.runQuery(internal.auth.user.requireSignedIn, {});
    const sandboxes = await ensureSandboxes(ctx, LANGUAGES, true);
    await store(ctx);
    return { sandboxes: sandboxes.map(({ language, state, reason }) => ({ language, state, ...(reason ? { reason } : {}) })) };
  },
});
