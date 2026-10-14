import { performance } from "node:perf_hooks";
import type { Server, IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type { WebSocket } from "ws";

export const INACTIVITY_MS = 30 * 60 * 1000;

// A new process is deliberately asleep. Neither startup, reads, bot work nor
// transport liveness are human activity. The single-instance deployment owns
// this monotonic deadline; game persistence is independent of this registry.
export function createActivityClock(now: () => number = () => performance.now()) {
  let deadline = -Infinity;
  return {
    isIdle: () => now() >= deadline,
    remaining: () => Math.max(0, deadline - now()),
    record: () => { deadline = now() + INACTIVITY_MS; },
  };
}

const clock = createActivityClock();
const servers = new Set<Server>();
const lifecycleDisposers = new WeakMap<Server, () => void>();
const connections = new Map<Socket, { requests: number; upgraded: boolean }>();
const websockets = new Map<WebSocket, () => boolean>();
const closingWebsockets = new WeakSet<WebSocket>();
let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
let sweepTimer: ReturnType<typeof setInterval> | undefined;

export async function initializeActivity(): Promise<void> {
  // Intentionally no startup wake and no database/schema side effects.
}
export const isLocallyIdle = () => clock.isIdle();
export async function isServerActive(): Promise<boolean> { return !clock.isIdle(); }
export async function recordHumanActivity() {
  clock.record();
  if (deadlineTimer) clearTimeout(deadlineTimer);
  deadlineTimer = setTimeout(sweepIdleConnections, clock.remaining() + 1);
  deadlineTimer.unref();
  return { active: true as const, idleDeadline: Date.now() + clock.remaining() };
}

function sweepIdleConnections() {
  if (!clock.isIdle()) return;
  for (const [ws, busy] of websockets) {
    // Let an admitted mutation persist before closing its transport.
    if (busy() || ws.readyState !== 1) continue;
    closeIdleSocket(ws);
  }
  for (const server of servers) server.closeIdleConnections();
  for (const [socket, state] of connections) {
    if (state.requests || state.upgraded || socket.destroyed) continue;
    // Includes incomplete/raw TCP connections, not just HTTP keepalives.
    socket.end();
    const grace = setTimeout(() => {
      if (clock.isIdle() && !state.requests && !state.upgraded) socket.destroy();
    }, 5000);
    grace.unref();
  }
}

export function closeIdleSocket(ws: WebSocket) {
  if (closingWebsockets.has(ws)) return;
  closingWebsockets.add(ws);
  ws.close(4008, "SERVER_IDLE");
  const grace = setTimeout(() => { if (ws.readyState !== 3) ws.terminate(); }, 5000);
  grace.unref();
  ws.once("close", () => clearTimeout(grace));
}

function ensureSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweepIdleConnections, 1000);
  sweepTimer.unref();
}
function stopUnusedSweep() {
  if (connections.size || websockets.size || !sweepTimer) return;
  clearInterval(sweepTimer);
  sweepTimer = undefined;
}

export function registerActivitySocket(ws: WebSocket, busy: () => boolean = () => false) {
  websockets.set(ws, busy);
  ensureSweep();
  ws.once("close", () => { websockets.delete(ws); stopUnusedSweep(); });
}

export function attachConnectionLifecycle(server: Server): () => void {
  const existing = lifecycleDisposers.get(server);
  if (existing) return existing;
  const ownedSockets = new Set<Socket>();
  let disposing = false;
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  servers.add(server);
  const connection = (socket: Socket) => {
    ownedSockets.add(socket);
    connections.set(socket, { requests: 0, upgraded: false });
    ensureSweep();
    socket.once("close", () => {
      ownedSockets.delete(socket);
      connections.delete(socket);
      stopUnusedSweep();
    });
  };
  const request = (req: IncomingMessage, res: ServerResponse) => {
    const state = connections.get(req.socket);
    if (!state) return;
    state.requests++;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      state.requests--;
      if (disposing || clock.isIdle()) server.closeIdleConnections();
    };
    res.once("finish", finish);
    res.once("close", finish);
  };
  const upgrade = (req: IncomingMessage) => {
    const state = connections.get(req.socket);
    if (state) state.upgraded = true;
  };
  const dispose = () => {
    if (disposing) return;
    disposing = true;
    server.closeIdleConnections();
    // server.close() does not bound incomplete HTTP headers/raw TCP. Only
    // destroy transports with no admitted request; never impose this timeout
    // on a handler that may still be committing a game mutation.
    drainTimer = setTimeout(() => {
      for (const socket of ownedSockets) {
        const state = connections.get(socket);
        if (state && !state.requests && !state.upgraded) socket.destroy();
      }
    }, 10000);
    drainTimer.unref();
  };
  lifecycleDisposers.set(server, dispose);
  server.on("connection", connection);
  server.prependListener("request", request);
  server.prependListener("upgrade", upgrade);
  server.once("close", () => {
    if (drainTimer) clearTimeout(drainTimer);
    server.off("connection", connection);
    server.off("request", request);
    server.off("upgrade", upgrade);
    servers.delete(server);
    lifecycleDisposers.delete(server);
    if (!servers.size && !connections.size && deadlineTimer) {
      clearTimeout(deadlineTimer);
      deadlineTimer = undefined;
    }
    stopUnusedSweep();
  });
  return dispose;
}
