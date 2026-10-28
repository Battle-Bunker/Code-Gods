// test/client-daemon-integration.worker.ts
import { createServer } from "node:http";

// ../../lib/player-client/src/daemon.ts
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z as z2 } from "zod";

// ../../lib/player-client/src/protocol.ts
import { z } from "zod";
var VERSION = "code-gods.player.v3";
var id = z.string().min(1).max(128);
var finite = z.number().finite();
var language = z.enum(["python", "typescript"]);
var wire = z.union([finite, z.string().max(1024)]);
var program = { language, source: z.string().min(1).max(16384).refine((source) => new TextEncoder().encode(source).length <= 16384, "Source exceeds 16384 UTF-8 bytes") };
var commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("validate"), ...program }).strict(),
  z.object({ type: z.literal("summon"), ...program }).strict(),
  z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
  z.object({ type: z.literal("pause") }).strict(),
  z.object({ type: z.literal("chat"), text: z.string().trim().min(1).max(2e3) }).strict(),
  // Gods may destroy their own agents at any time, for free.
  z.object({ type: z.literal("destroy"), agentId: id }).strict()
]);
var GAME_COMMANDS = ["validate", "summon", "pause", "destroy"];
var commandTimeoutMs = (command) => command.type === "validate" || command.type === "summon" ? 12e4 : 15e3;
var envelopeSchema = z.object({
  version: z.literal(VERSION),
  commandId: z.string().uuid(),
  command: commandSchema,
  gameId: id.optional()
}).strict();
var ordinal = z.union([finite, z.array(finite).max(16)]);
var shape = z.union([z.object({ kind: z.literal("scalar") }), z.object({ kind: z.literal("tuple"), arity: z.number().int().min(1).max(16) })]);
var badge = z.object({ id: z.string().max(64), emoji: z.string().max(16), label: z.string().max(128), kid: z.string().max(300) });
var helper = z.object({
  name: z.object({ python: z.string().max(64), typescript: z.string().max(64) }),
  signature: z.object({ python: z.string().max(300), typescript: z.string().max(300) }),
  kid: z.string().max(500),
  class: z.string().max(64).optional(),
  group: z.enum(["read", "mutator"])
});
var instanceSchema = z.object({
  objectType: z.string().max(32),
  key: z.string().max(128),
  label: z.string().max(300),
  args: z.record(z.string(), z.union([finite, z.string().max(64)])),
  badges: z.array(badge).max(32),
  terms: z.record(z.string(), finite),
  display: z.record(z.string(), z.unknown()),
  codec: z.object({ format: z.string().max(64), maxLength: z.number().int().nonnegative() }),
  mutators: z.array(z.object({ id: z.string().max(64), name: z.string().max(128), emoji: z.string().max(16), summary: z.string().max(500) })).max(64),
  helpers: z.array(helper).max(128)
});
var utilityCardSchema = z.object({
  familyId: z.string().max(128),
  emoji: z.string().max(16),
  name: z.string().max(128),
  theme: z.string().max(500),
  summary: z.string().max(2e3),
  language,
  source: z.string().max(16384),
  shape: shape.optional(),
  penalty: z.object({
    familyId: z.string().max(128),
    emoji: z.string().max(16),
    name: z.string().max(128),
    summary: z.string().max(2e3),
    comparative: z.string().max(64),
    source: z.string().max(16384),
    shape: shape.optional()
  }).optional()
});
var breakdownSchema = z.object({ decision: finite, erasure: finite, motion: finite, floor: finite });
var observationSchema = z.object({
  version: z.literal(VERSION),
  roomId: id,
  revision: z.number().int().nonnegative(),
  gameId: id.optional(),
  planningEndsAt: finite.optional(),
  pauseEndsAt: finite.optional(),
  phase: z.enum(["lobby", "planning", "running", "paused", "ended"]),
  language,
  // `seated` is false for a member who joined after this game launched: they spectate and play in the next one.
  roomShortCode: z.string().max(32).optional(),
  gameShortCode: z.string().max(32).optional(),
  seated: z.boolean().optional(),
  instance: instanceSchema.optional(),
  /** The game's energy rules. God energy pays summons (real time); each agent earns per world second. */
  economy: z.object({
    energyPerSecond: finite,
    agentEnergyPerSecond: finite,
    agentBatteryActs: finite,
    maxAgentsPerGod: z.number().int().nonnegative(),
    penaltyWeight: finite,
    worldSeconds: finite
  }).optional(),
  self: z.object({
    godId: id,
    label: z.string().max(128),
    isAI: z.boolean(),
    energy: finite,
    ready: z.boolean(),
    pauseUsed: z.boolean().optional(),
    utility: utilityCardSchema.optional()
  }),
  // Your own score of each object and aggregates over your peers. Individual opponents' scores are never disclosed.
  objects: z.array(z.object({
    id,
    value: wire,
    own: z.object({ ordinal, rewardBits: finite, penaltyBits: finite.optional(), netBits: finite }),
    peerNetBits: finite,
    peerCare: finite,
    payoff: finite
  })).max(2e3),
  // Your agents. An agent acts only while eligible (energy ≥ expectedActCost); a negative energy is a cooldown.
  agents: z.array(z.object({
    id,
    source: z.string().max(16384),
    language,
    summonCost: finite,
    decisionBits: finite,
    expectedActCost: finite,
    breakdown: breakdownSchema,
    randomized: z.boolean(),
    energy: finite,
    eligible: z.boolean(),
    acts: z.number().int().nonnegative(),
    spent: finite
  })).max(200),
  transformations: z.array(z.object({
    id,
    agentId: id,
    before: wire,
    after: wire,
    calls: z.array(z.tuple([z.string().max(64), z.record(z.string(), z.unknown())])).max(16).optional(),
    cost: finite.optional()
  })).max(500),
  leaderboard: z.array(z.object({ godId: id, label: z.string().max(128), isAI: z.boolean(), totalPayoff: finite })).max(100),
  chat: z.array(z.object({ id, godId: id, label: z.string().max(128), isAI: z.boolean(), text: z.string().max(2e3) })).max(100)
});
var resultSchema = z.object({
  commandId: z.string().uuid(),
  accepted: z.boolean(),
  message: z.string().max(2e3),
  // cost: the summon price (description bits, by part); every act then pays decisionBits + erasure + motion + floor.
  validation: z.object({
    valid: z.boolean(),
    cost: finite.nonnegative(),
    expectedActCost: finite.nonnegative(),
    parts: z.object({ structure: finite, names: finite, literals: finite, moveFlags: finite, literalMoves: finite }).optional(),
    decisionBits: finite.nonnegative().optional(),
    breakdown: breakdownSchema.optional(),
    randomized: z.boolean().optional(),
    diagnostics: z.array(z.string().max(1e3)).max(30)
  }).optional()
});

// ../../lib/player-client/src/transport.ts
var TransportError = class extends Error {
  constructor(status, code) {
    super(code === "SERVER_IDLE" ? "Server idle. Resume explicitly to reconnect." : `Player service request failed (${status})`);
    this.status = status;
    this.code = code;
  }
  status;
  code;
};
var HttpPlayerTransport = class {
  constructor(base, fetcher = fetch) {
    this.base = base;
    this.fetcher = fetcher;
    const url = new URL(base);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("HTTPS required");
    if (url.username || url.password || url.search || url.hash) throw new Error("Plain player API URL required");
    this.base = base.replace(/\/$/, "");
  }
  base;
  fetcher;
  idle = false;
  #credential;
  approve(credential) {
    this.idle = false;
    if (!credential.token || credential.expiresAt <= Date.now() || credential.expiresAt > Date.now() + 4 * 60 * 6e4) throw new Error("Invalid room credential");
    this.#credential = { ...credential };
  }
  disconnect() {
    this.#credential = void 0;
  }
  async wake(signal) {
    const credential = this.#credential;
    if (!credential || credential.expiresAt <= Date.now()) throw new TransportError(401);
    const response = await this.fetcher(new URL("/api/activity", this.base), {
      method: "POST",
      redirect: "error",
      signal,
      headers: { Authorization: `Bearer ${credential.token}`, "Content-Type": "application/json" },
      body: "{}"
    });
    if (!response.ok) throw new TransportError(response.status);
    this.idle = false;
  }
  async request(path, body, signal) {
    if (this.idle) throw new TransportError(503, "SERVER_IDLE");
    const credential = this.#credential;
    if (!credential || credential.expiresAt <= Date.now()) {
      this.disconnect();
      throw new TransportError(401);
    }
    const response = await this.fetcher(`${this.base}/rooms/${encodeURIComponent(credential.roomId)}/${path}`, {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal,
      headers: { Authorization: `Bearer ${credential.token}`, "Content-Type": "application/json" },
      ...body ? { body: JSON.stringify(body) } : {}
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.code === "SERVER_IDLE") this.idle = true;
      if (response.status === 401) this.disconnect();
      throw new TransportError(response.status, data.code);
    }
    return response.json();
  }
  async observe(signal) {
    const result = observationSchema.parse(await this.request("observation", void 0, signal));
    if (result.roomId !== this.#credential?.roomId || result.self.godId !== this.#credential?.godId) throw new Error("Observation identity mismatch");
    return result;
  }
  async send(envelope, signal) {
    envelope = envelopeSchema.parse(envelope);
    const result = resultSchema.parse(await this.request("commands", envelope, signal));
    if (result.commandId !== envelope.commandId) throw new Error("Command receipt mismatch");
    return result;
  }
};

// ../../lib/player-client/src/socket-transport.ts
var WebSocketPlayerTransport = class {
  constructor(base, factory, fetcher = fetch) {
    this.base = base;
    this.factory = factory;
    this.http = new HttpPlayerTransport(base, fetcher);
  }
  base;
  factory;
  http;
  credential;
  socket;
  reconnect;
  attempt = 0;
  epoch = 0;
  revision = -1;
  opened = false;
  get connected() {
    return this.opened && this.socket?.readyState === 1;
  }
  get idle() {
    return this.http.idle;
  }
  async wake(signal) {
    await this.http.wake(signal);
    if (!this.socket) this.connect();
  }
  sleep() {
    this.http.idle = true;
    this.opened = false;
    this.epoch++;
    clearTimeout(this.reconnect);
    const socket = this.socket;
    this.socket = void 0;
    socket?.close();
    for (const receipt of this.pending.values()) {
      receipt.cleanup();
      receipt.reject(new TransportError(503, "SERVER_IDLE"));
    }
    this.pending.clear();
    this.report(new TransportError(503, "SERVER_IDLE"));
  }
  listeners = /* @__PURE__ */ new Set();
  errors = /* @__PURE__ */ new Set();
  pending = /* @__PURE__ */ new Map();
  subscribe(listener, onError) {
    this.listeners.add(listener);
    if (onError) this.errors.add(onError);
    return () => {
      this.listeners.delete(listener);
      if (onError) this.errors.delete(onError);
    };
  }
  report(error) {
    for (const listener of this.errors) listener(error);
  }
  approve(credential) {
    this.disconnect();
    this.http.approve(credential);
    this.credential = { ...credential };
    this.connect();
  }
  disconnect() {
    this.epoch++;
    this.opened = false;
    this.credential = void 0;
    clearTimeout(this.reconnect);
    const socket = this.socket;
    this.socket = void 0;
    socket?.close();
    this.http.disconnect();
    for (const receipt of this.pending.values()) {
      receipt.cleanup();
      receipt.reject(new Error("Connection closed; retry the same command ID."));
    }
    this.pending.clear();
    this.attempt = 0;
  }
  emit(observation) {
    if (observation.roomId !== this.credential?.roomId || observation.self.godId !== this.credential?.godId) throw new Error("Observation identity mismatch");
    if (observation.revision < this.revision) return;
    this.revision = observation.revision;
    for (const listener of this.listeners) listener(observation);
  }
  connect() {
    if (this.idle) return;
    const credential = this.credential, epoch = ++this.epoch;
    this.revision = -1;
    let cursor = -1;
    if (!credential || credential.expiresAt <= Date.now()) {
      this.disconnect();
      return;
    }
    const url = new URL(`/api/rooms/${encodeURIComponent(credential.roomId)}/ws`, this.base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const retry = (event) => {
      if (epoch !== this.epoch) return;
      this.opened = false;
      if (event?.code === 1008 || event?.code === 4401 || event?.code === 4403) {
        this.disconnect();
        this.report(new TransportError(401));
        return;
      }
      if (event?.code === 4008) {
        this.sleep();
        return;
      }
      this.epoch++;
      this.socket = void 0;
      for (const receipt of this.pending.values()) {
        receipt.cleanup();
        receipt.reject(new Error("Receipt unknown; retry the same command ID."));
      }
      this.pending.clear();
      this.report(new Error("Player WebSocket disconnected; reconnecting."));
      this.reconnect = setTimeout(() => this.connect(), Math.min(1e3 * 2 ** Math.min(this.attempt++, 5), 15e3) * (0.5 + Math.random() * 0.5));
    };
    let socket;
    try {
      socket = this.factory(url.href, { headers: { Authorization: `Bearer ${credential.token}` } });
    } catch {
      retry();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (epoch !== this.epoch) return;
      this.opened = true;
      void this.http.observe(AbortSignal.timeout(15e3)).then((o) => {
        if (epoch === this.epoch) {
          this.attempt = 0;
          this.emit(o);
        }
      }).catch((e) => {
        if (epoch === this.epoch) {
          if (this.http.idle) this.sleep();
          else this.report(e instanceof Error ? e : new Error("Snapshot failed"));
        }
      });
    };
    socket.onmessage = (event) => {
      if (epoch !== this.epoch) return;
      try {
        const message = JSON.parse(String(event.data));
        if (message.type === "player.observation" && message.protocolVersion === 1) {
          if (typeof message.seq === "number" && message.seq <= cursor) return;
          const observation = observationSchema.parse(message.payload);
          if (typeof message.seq === "number") cursor = message.seq;
          this.emit(observation);
        } else if (message.type === "command.receipt") {
          const result = resultSchema.parse(message.payload), pending = this.pending.get(result.commandId);
          if (pending) {
            this.pending.delete(result.commandId);
            pending.cleanup();
            pending.resolve(result);
          }
        }
      } catch {
        this.report(new Error("Invalid player WebSocket payload."));
      }
    };
    socket.onerror = () => {
      if (epoch === this.epoch) this.report(new Error("Player WebSocket error."));
    };
    socket.onclose = retry;
  }
  async observe(signal) {
    try {
      return await this.http.observe(signal);
    } catch (error) {
      if (this.http.idle) this.sleep();
      throw error;
    }
  }
  async send(envelope, signal) {
    if (this.idle) throw new TransportError(503, "SERVER_IDLE");
    envelope = envelopeSchema.parse(envelope);
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) return this.http.send(envelope, signal);
    if (signal?.aborted) throw new Error("Command aborted.");
    if (this.pending.has(envelope.commandId)) throw new Error("Command is already awaiting a receipt.");
    return new Promise((resolve, reject) => {
      const fail = () => {
        this.pending.delete(envelope.commandId);
        cleanup();
        reject(new Error("Receipt unknown; retry the same command ID."));
      };
      const timer = setTimeout(fail, 15e3);
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", fail);
      };
      this.pending.set(envelope.commandId, { resolve, reject, cleanup });
      signal?.addEventListener("abort", fail, { once: true });
      try {
        socket.send(JSON.stringify(envelope));
      } catch {
        fail();
      }
    });
  }
};

// ../../lib/player-client/src/daemon.ts
var secret = () => randomBytes(32).toString("base64url");
var equal = (a, b) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
var credentialSchema = z2.object({ token: z2.string().min(1).max(8192), roomId: z2.string(), godId: z2.string(), expiresIn: z2.number().positive().max(14400) });
var pendingSchema = z2.object({ deviceId: z2.string().min(1), deviceSecret: z2.string().min(1), roomId: z2.string().uuid(), userCode: z2.string().max(64), verificationPath: z2.string(), expiresIn: z2.number().positive().max(900), interval: z2.number().min(1).max(30) });
function createPlayerDaemon(options) {
  const origin = new URL(options.origin).origin;
  const serverUrl = options.serverUrl.replace(/\/$/, "");
  const serverOrigin = new URL(serverUrl).origin;
  const deviceBase = new URL("/api/device/", serverOrigin).href;
  const fetcher = options.fetcher ?? fetch;
  const transport = options.socketFactory ? new WebSocketPlayerTransport(serverUrl, options.socketFactory, fetcher) : new HttpPlayerTransport(serverUrl, fetcher);
  const cookieName = "code_gods_player";
  const base = options.basePath.replace(/\/$/, "");
  let ticket = secret(), ticketExpiry = Date.now() + 6e4;
  let session = "", csrf = "", sessionExpiry = 0;
  let approvedUntil = 0;
  let pending;
  let approvalBusy = false;
  let gameId;
  const receipts = /* @__PURE__ */ new Map();
  const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
  const cookie = (value, maxAge) => `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=${base || "/"}; Max-Age=${maxAge}${origin.startsWith("https:") ? "; Secure" : ""}`;
  async function upstream(path, body) {
    const response = await fetcher(`${deviceBase}${path}`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15e3), headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new TransportError(response.status);
    return response.json();
  }
  const launchUrl = () => {
    ticket = secret();
    ticketExpiry = Date.now() + 6e4;
    return `${origin}${base}/#launch=${ticket}`;
  };
  async function handle(request) {
    try {
      const url = new URL(request.url);
      if (url.origin !== origin) return json({ error: "Invalid host" }, 403);
      const path = url.pathname.slice(`${base}/daemon`.length);
      if (!url.pathname.startsWith(`${base}/daemon/`)) return json({ error: "Not found" }, 404);
      if (request.method !== "GET" && (request.method !== "POST" || request.headers.get("origin") !== origin)) return json({ error: "Invalid origin" }, 403);
      if (request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Cross-site request" }, 403);
      let body;
      if (request.method === "POST") {
        if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON required" }, 415);
        const text = await request.text();
        if (Buffer.byteLength(text) > 24e3) return json({ error: "Request too large" }, 413);
        body = JSON.parse(text);
      }
      if (path === "/session" && request.method === "POST") {
        const input = z2.object({ ticket: z2.string().max(128) }).strict().parse(body);
        if (!ticket || Date.now() > ticketExpiry || !equal(input.ticket, ticket)) return json({ error: "Invalid launch ticket" }, 401);
        ticket = "";
        session = secret();
        csrf = secret();
        sessionExpiry = Date.now() + 60 * 6e4;
        return json({ authenticated: true }, 200, { "Set-Cookie": cookie(session, 3600) });
      }
      const supplied = request.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? "";
      if (!session || Date.now() > sessionExpiry || !equal(supplied, session)) return json({ error: "Authentication required" }, 401);
      if (request.method === "POST" && !equal(request.headers.get("x-csrf-token") ?? "", csrf)) return json({ error: "CSRF rejected" }, 403);
      if (path === "/session" && request.method === "GET") return json({ csrf, connected: approvedUntil > Date.now(), idle: transport.idle });
      if (path === "/wake" && request.method === "POST") {
        await transport.wake(AbortSignal.timeout(15e3));
        return json({ resumed: true });
      }
      if (path === "/disconnect" && request.method === "POST") {
        transport.disconnect();
        approvedUntil = 0;
        pending = void 0;
        gameId = void 0;
        receipts.clear();
        session = "";
        csrf = "";
        return json({ disconnected: true }, 200, { "Set-Cookie": cookie("", 0) });
      }
      if (path === "/approval" && request.method === "POST") {
        if (approvalBusy || pending) return json({ error: "Approval already pending" }, 409);
        const input = z2.object({ roomId: z2.string().min(1).max(128) }).strict().parse(body);
        approvalBusy = true;
        const approvalSession = session;
        try {
          const verifier = secret();
          const challenge = createHash("sha256").update(verifier).digest("base64url");
          const result = pendingSchema.parse(await upstream("request", { roomId: input.roomId, challenge }));
          if (session !== approvalSession) return json({ error: "Approval cancelled" }, 409);
          if (z2.string().uuid().safeParse(input.roomId).success && input.roomId.toLowerCase() !== result.roomId.toLowerCase()) throw new Error("Room mismatch");
          const verificationUri = new URL(result.verificationPath, serverOrigin);
          if (verificationUri.origin !== serverOrigin || verificationUri.username || verificationUri.password || verificationUri.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(verificationUri.hostname)) throw new Error("Invalid approval response");
          transport.disconnect();
          approvedUntil = 0;
          gameId = void 0;
          receipts.clear();
          pending = { ...result, verifier, expiresAt: Date.now() + result.expiresIn * 1e3, intervalMs: result.interval * 1e3, nextPoll: Date.now() + result.interval * 1e3 };
          return json({ verificationUri: verificationUri.href, userCode: result.userCode });
        } finally {
          approvalBusy = false;
        }
      }
      if (path === "/approval/poll" && request.method === "POST") {
        if (!pending || pending.expiresAt <= Date.now()) {
          pending = void 0;
          return json({ error: "Approval expired" }, 410);
        }
        if (approvalBusy || pending.nextPoll > Date.now()) return json({ status: "pending" });
        approvalBusy = true;
        const active = pending;
        active.nextPoll = Date.now() + active.intervalMs;
        try {
          const result = z2.union([z2.object({ status: z2.literal("pending") }), credentialSchema]).parse(await upstream("poll", { deviceId: active.deviceId, deviceSecret: active.deviceSecret, verifier: active.verifier }));
          if (pending !== active || !session) return json({ error: "Approval cancelled" }, 409);
          if ("token" in result) {
            if (result.roomId !== active.roomId) throw new Error("Room mismatch");
            const expiresAt = Date.now() + result.expiresIn * 1e3;
            transport.approve({ ...result, expiresAt });
            approvedUntil = expiresAt;
            pending = void 0;
            return json({ status: "approved" });
          }
          return json({ status: "pending" });
        } finally {
          approvalBusy = false;
        }
      }
      if (path === "/observation" && request.method === "GET") {
        const observation = await transport.observe(AbortSignal.timeout(15e3));
        gameId = observation.gameId;
        return json(observation);
      }
      if (path === "/commands" && request.method === "POST") {
        const envelope = envelopeSchema.parse(body);
        const serialized = JSON.stringify(envelope);
        const prior = receipts.get(envelope.commandId);
        if (prior && prior.body !== serialized) return json({ error: "Command ID reused with different payload" }, 409);
        if (prior?.result) return json(await prior.result);
        if (!prior && receipts.size >= 2e3) return json({ error: "Session command limit; reconnect" }, 429);
        const prepared = prior?.envelope ?? { ...envelope, ...!envelope.gameId && gameId && GAME_COMMANDS.includes(envelope.command.type) ? { gameId } : {} };
        const result = transport.send(prepared, AbortSignal.timeout(commandTimeoutMs(prepared.command)));
        const entry = { body: serialized, envelope: prepared, result };
        receipts.set(envelope.commandId, entry);
        try {
          return json(await result);
        } catch (error) {
          entry.result = void 0;
          throw error;
        }
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json({ error: error instanceof z2.ZodError ? "Invalid payload" : error instanceof TransportError && error.status === 401 ? "Device approval expired. Reapprove this player." : "Player service unavailable", ...error instanceof TransportError && error.code ? { code: error.code } : {} }, error instanceof z2.ZodError ? 400 : error instanceof TransportError ? error.status : 502);
    }
  }
  return { handle, launchUrl, close: () => {
    transport.disconnect();
    session = "";
    ticket = "";
    csrf = "";
    pending = void 0;
    receipts.clear();
  } };
}

// ../../lib/player-client/src/node-handler.ts
function nodeHandler(handle, origin) {
  return async (req, res) => {
    if (req.headers.host !== new URL(origin).host) {
      res.writeHead(403);
      res.end();
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 24e3) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(Buffer.from(chunk));
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
    const response = await handle(new Request(new URL(req.url ?? "/", origin), {
      method: req.method,
      headers,
      ...chunks.length ? { body: Buffer.concat(chunks) } : {}
    }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}

// ../../lib/player-client/src/node-socket.ts
import WebSocket from "ws";
var nodeSocketFactory = (url, options) => {
  const socket = new WebSocket(url, {
    headers: options.headers,
    followRedirects: false,
    handshakeTimeout: 15e3,
    maxPayload: 4 * 1024 * 1024
  });
  const adapter = {
    get readyState() {
      return socket.readyState;
    },
    send(data) {
      socket.send(data);
    },
    close() {
      socket.close();
    },
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null
  };
  socket.on("open", () => adapter.onopen?.());
  socket.on("close", (code) => adapter.onclose?.({ code }));
  socket.on("error", () => adapter.onerror?.());
  socket.on("unexpected-response", (_request, response) => {
    const code = response.statusCode === 401 ? 4401 : response.statusCode === 403 ? 4403 : 1006;
    response.resume();
    adapter.onclose?.({ code });
    socket.terminate();
  });
  socket.on("message", (data) => adapter.onmessage?.({ data: data.toString() }));
  return adapter;
};

// test/client-daemon-integration.worker.ts
var server = createServer();
server.listen(0, "127.0.0.1", () => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  const stats = { opens: 0, observations: 0, receipts: 0, transformations: 0 };
  const daemon = createPlayerDaemon({
    origin,
    basePath: "/player",
    serverUrl: process.argv[2],
    socketFactory: (url, options) => {
      const socket = nodeSocketFactory(url, options);
      sockets.push(socket);
      let onopen = null, onmessage = null;
      Object.defineProperty(socket, "onopen", { get: () => () => {
        stats.opens++;
        onopen?.();
      }, set: (v) => {
        onopen = v;
      } });
      Object.defineProperty(socket, "onmessage", { get: () => (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type === "player.observation") stats.observations++;
        if (message.type === "command.receipt") stats.receipts++;
        if (message.type === "object.transformed") stats.transformations++;
        onmessage?.(event);
      }, set: (v) => {
        onmessage = v;
      } });
      return socket;
    }
  });
  server.on("request", nodeHandler(daemon.handle, origin));
  process.send?.({ origin, launch: daemon.launchUrl(), pid: process.pid });
  process.on("message", (message) => {
    if (message.type === "stats") process.send?.({ ...stats });
    if (message.type === "drop") {
      sockets.at(-1)?.close();
      process.send?.({ dropped: true });
    }
    if (message.type === "stop") {
      daemon.close();
      server.close(() => process.exit(0));
    }
  });
});
