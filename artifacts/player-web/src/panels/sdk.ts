/**
 * `@sdk` version 2 as a file panel (src/panels/*.tsx) imports it: the same names as a stored panel's frame SDK
 * (src/frame/sdk.ts), with the app's own hooks running in the page instead of over the bridge. A file panel is the
 * developer's own source, built with the app (v1's file panels ran in-process too); ./sdk-parity.ts keeps the two
 * SDKs' names identical, so a file panel saved as a stored panel runs unchanged.
 */
export * from "../sdk/panel-kit";
export {
  useRoomInfo, useGame, useMe, useMyRule, useMyAgents, useAgentCount, useLeaderboard, useStandingsHistory, useDigest,
  useMyObject, useMyObjects, useAgentEnergy, useAgentPrograms, useObjectIds, useSpectatorObjectIds, useMoves, useChat, useOthersBlurred,
} from "../sdk/hooks";
