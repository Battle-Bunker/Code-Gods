import { AIController } from "@workspace/ai-player";
import { allRooms, mutate, resolveRoom } from "./store";
import { getAIProvider } from "./ai-provider";
import { observation, executePlayerEnvelope } from "./player-api";
import type { Actor } from "./types";
import { logger } from "../lib/logger";
import { isLocallyIdle } from "./activity";

// Shared host-key safety ceilings, in addition to explicit room-owner token approval.
const DAILY_HOST_USD = 5, GAME_USD = 2, CALLS_PER_MINUTE = 6;
export async function reserveAI(roomId: string, gameId: string, tokens: number, usd: number, checkActive?: () => void) {
  return mutate(roomId, async room => {
    checkActive?.();
    if (!room.game || room.game.id !== gameId || ["ended", "recovery"].includes(room.game.phase)) throw new Error("AI game inactive");
    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
    const daily = allRooms().reduce((sum, r) => sum + (r.aiDaily.day === day ? r.aiDaily.usd : 0), 0);
    const calls = room.aiDaily.calls.filter(t => now - t < 60000);
    if (!Number.isSafeInteger(tokens) || tokens < 1 || !Number.isFinite(usd) || usd <= 0 ||
        room.aiUsed + tokens > room.aiBudget || room.aiReservedUsd + usd > GAME_USD ||
        daily + usd > DAILY_HOST_USD || calls.length >= CALLS_PER_MINUTE) throw new Error("AI budget or rate limit reached");
    room.aiUsed += tokens; room.aiReservedUsd += usd;
    room.aiDaily = { day, usd: (room.aiDaily.day === day ? room.aiDaily.usd : 0) + usd, calls: [...calls, now] };
    let settled = false;
    return { reservedTokens: tokens, reservedUsd: usd,
      settle: async (actualTokens: number, usage: {inputTokens:number;outputTokens:number}) => {
        if (!Number.isSafeInteger(actualTokens) || actualTokens < 0 || actualTokens > tokens) throw new Error("Invalid AI usage");
        if (![usage.inputTokens,usage.outputTokens].every(n=>Number.isSafeInteger(n) && n>=0) ||
            usage.inputTokens+usage.outputTokens!==actualTokens) throw new Error("Invalid AI usage breakdown");
        await mutate(roomId, async current => {
          if (settled) return;
          settled = true;
          // A later game has its own counters; never refund into it.
          if (current.game?.id !== gameId) return;
          current.aiUsed -= tokens - actualTokens;
          current.aiInputTokens = (current.aiInputTokens ?? 0) + usage.inputTokens;
          current.aiOutputTokens = (current.aiOutputTokens ?? 0) + usage.outputTokens;
        });
      },
    };
  });
}
export function startAIService() {
  const controllers = new Map<string, AIController>();
  const due = new Map<string, number>();
  let pending: Promise<void> | undefined;
  let turn: AbortController | undefined;
  let stopped = false;
  const checkActive = () => {
    if (stopped || isLocallyIdle()) throw new Error("AI service inactive");
    turn?.signal.throwIfAborted();
  };
  const timer = setInterval(() => {
    if (stopped || isLocallyIdle()) {
      turn?.abort();
      for (const controller of controllers.values()) controller.stop();
      controllers.clear();
      return;
    }
    if (pending) return;
    turn = new AbortController();
    pending = (async () => {
      for (const room of allRooms()) {
        checkActive();
        const g = room.game;
        if (!g || ["ended", "recovery"].includes(g.phase)) continue;
        const bots = g.roster.filter(m => m.kind === "ai" && g.deities.some(d => d.id === m.id));
        if (!bots.length || (due.get(room.id) ?? 0) > Date.now()) continue;
        due.set(room.id, Date.now() + 11000);
        const index = Math.floor(Date.now() / 11000) % bots.length, bot = bots[index];
        const key = `${g.id}:${bot.id}`;
        let controller = controllers.get(key);
        if (!controller) {
          if (!bot.aiAgent) {
            await mutate(room.id, async draft => {
              const seat = draft.members.find(m => m.id === bot.id);
              if (seat) seat.status = "Missing agent snapshot; start a new game with a library agent";
            });
            continue;
          }
          const actor: Actor = { ...bot, scope: "player", roomId: room.id };
          controller = new AIController({
            roomId: room.id, godId: bot.id, provider: getAIProvider(bot.aiAgent), customPrompt: bot.aiAgent.prompt,
            budget: { reserve: (tokens, usd) => { checkActive(); return reserveAI(room.id, g.id, tokens, usd, checkActive); } },
            transport: {
              observe: async () => { checkActive(); return observation(resolveRoom(room.id), actor); },
              send: async envelope => { checkActive(); return executePlayerEnvelope(room.id, actor, envelope); },
            },
            onEvent: event => {
              if (event.type === "status" || event.type === "failure") {
                if (stopped || isLocallyIdle()) return;
                void mutate(room.id, async draft => {
                  const member = draft.members.find(m => m.id === bot.id);
                  if (member) member.status = event.type === "status" ? event.status : event.code;
                }).catch(() => {});
              }
            },
          });
          controllers.set(key, controller);
        }
        await controller.step(turn!.signal).catch(() => {}); // sanitized status is emitted by the controller
      }
      for (const [key, controller] of controllers) {
        if (!allRooms().some(r => r.game && key.startsWith(`${r.game.id}:`) && r.game.phase !== "ended")) {
          controller.stop(); controllers.delete(key);
        }
      }
    })().catch(error => {
      if (!stopped && !isLocallyIdle()) logger.error({ errorName: error.name }, "AI service turn unavailable");
    }).finally(() => { pending = undefined; });
  }, 1000).unref();
  return async () => {
    stopped = true; clearInterval(timer); turn?.abort();
    for (const controller of controllers.values()) controller.stop();
    controllers.clear();
    await pending;
  };
}
