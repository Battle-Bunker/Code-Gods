import { GAME_COMMANDS, VERSION, commandSchema, type Command, type Envelope, type Observation, type PlayerTransport } from "./protocol.ts";

/** Builds v3 envelopes and runs them through any PlayerTransport (the engine's AI seats bring their own). */
export class PlayerClient {
  private observation: Observation | undefined;
  readonly transport: PlayerTransport;
  constructor(transport: PlayerTransport) { this.transport = transport; }
  async observe(signal?: AbortSignal) { const observation = await this.transport.observe(signal); this.observation = observation; return observation; }
  prepare(command: Command, observation: Observation | undefined = this.observation): Envelope {
    return { version: VERSION, commandId: crypto.randomUUID(), command: commandSchema.parse(command),
      ...(GAME_COMMANDS.includes(command.type) && observation?.gameId ? { gameId: observation.gameId } : {}) };
  }
  /** Retry the SAME envelope after an uncertain failure; the engine deduplicates by commandId. */
  execute(envelope: Envelope, signal?: AbortSignal) { return this.transport.send(envelope, signal); }
}
