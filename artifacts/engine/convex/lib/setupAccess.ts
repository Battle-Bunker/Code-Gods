/**
 * Which system setups only administrators see (game-core SeedSetup.adminOnly: experiments, and setups not ready for
 * players). Decided by the code, never by the stored row, so it needs no schema field. Pure (packages only): the unit
 * tests load it directly; convex/setups.ts applies it in every reader and in its lookup by id.
 */
import { ADMIN_ONLY_SEED_IDS } from "@workspace/game-core";

type SetupOwner = { readonly ownerId: string | null; readonly seedId?: string };

/** A system setup only administrators see. A human's setup never is, whatever its fields. */
export const adminOnly = (d: SetupOwner): boolean => d.ownerId === null && d.seedId !== undefined && ADMIN_ONLY_SEED_IDS.has(d.seedId);

/** Whether a setup does not exist for this viewer: an administrator-only one, for anyone else (credentials included). */
export const hiddenFrom = (d: SetupOwner, viewer: { readonly isAdmin: boolean }): boolean => adminOnly(d) && !viewer.isAdmin;
