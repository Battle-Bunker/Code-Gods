# The in-client assistant's token efficiency

Research, design and measurements for making the in-client assistant cheap per question (2026-11-01). The owner's
brief: "research best practices for agent design in terms of token efficiency … design the agent around modern
standards like skills and MCP that dynamically load from a lightweight index of short names and descriptions per
tool." Target: a typical question under 10k charged tokens, 20+ questions per 200k allowance.

## 1. Research: current practice for tool-heavy agents

Sources were read on 2026-11-01. Anthropic API facts come from the platform docs and were checked with live requests
(section 1.6).

### 1.1 Deferred tools and tool search (Anthropic)

- **Tool search tool** (Anthropic docs, "Tool search tool", status stable; supported on every current model,
  including `claude-sonnet-5-5` and `claude-opus-5-5`)
  <https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool>.
  - Every tool definition is still sent in `tools`. Tools marked `defer_loading: true` stay out of the model's
    context until a search returns them as `tool_reference` blocks, which the API expands into full definitions.
  - The API keeps deferred tools out of the system-prompt prefix and appends expanded definitions inline, so the
    prompt cache survives discovery.
  - Recommended above about 10 tools or 10k tokens of definitions. Keep the 3–5 most used tools non-deferred. At
    least one tool must stay non-deferred, or the request is a 400.
- **Custom tool search.** A client tool may return `tool_reference` blocks in a standard `tool_result`. "Every tool
  referenced must have a corresponding tool definition … normally with `defer_loading: true`." No server search tool
  is needed.
- **Engineering post** "Introducing advanced tool use" (Anthropic, 2025-11-24)
  <https://www.anthropic.com/engineering/advanced-tool-use>:
  - a five-server MCP setup used about 77k tokens of tool definitions before any work; with tool search it used
    about 8.7k (85% less);
  - tool-selection accuracy rose (Opus 4.5: 79.5% → 88.1%);
  - programmatic tool calling cut tokens 37% on research tasks;
  - tool-use examples belong in 1–5 concise cases, and only where the schema is ambiguous.
- The same post points to "Effective context engineering for AI agents" (Anthropic, 2025): load just in time, keep the
  always-on context minimal and high-signal.

### 1.2 Agent Skills (progressive disclosure)

- **Agent Skills specification** <https://agentskills.io/specification>. A skill is a folder with a `SKILL.md`:
  `name` (≤ 64 characters, kebab-case) and `description` (≤ 1024 characters, what it does and when to use it) in
  frontmatter, then a Markdown body. Agents load skills in three levels:
  1. metadata, about 100 tokens per skill, always in context;
  2. the body, under 5,000 tokens recommended, loaded when the skill is activated;
  3. referenced files, loaded only when needed.
- **Anthropic's agent-design guidance** (claude-api skill, `shared/agent-design.md`): "Both patterns [tool search and
  skills] keep the fixed context small and load detail on demand"; tool search "appends tool schemas rather than
  swapping them, so the existing prefix is preserved."

### 1.3 MCP: tools/list, annotations, large tool sets

- **MCP spec 2026-07-28, Tools**
  <https://modelcontextprotocol.io/specification/2026-07-28/server/tools>:
  - `tools/list` supports pagination (`cursor` / `nextCursor`), caching hints (`ttlMs`, `cacheScope`) and a
    `listChanged` capability;
  - each tool has `name`, optional `title`, `description`, a required `inputSchema`, an optional `outputSchema` and
    `annotations` (behaviour hints such as `readOnlyHint` and `destructiveHint`; clients must treat them as untrusted
    unless the server is trusted);
  - servers SHOULD return tools in a deterministic order, which "improves LLM prompt cache hit rates when tools are
    included in model context".
- The spec has no lazy-schema mechanism: every listed tool carries its full `inputSchema`. Clients do the deferring.
  Claude Code (this very environment) lists MCP and other deferred tools by name only, fetches a schema with
  `ToolSearch` when needed, and lists skills as one-line descriptions with bodies loaded by the `Skill` tool.
  Anthropic's MCP connector takes `defer_loading` per server (`default_config`) or per tool (`configs`).
- So an MCP server makes itself cheap by keeping `description`s short and putting the long guidance where it is
  loaded on demand (here, skills), with deterministic ordering and accurate annotations.

### 1.4 OpenAI

- **Tool search** (OpenAI docs, "Tool search") <https://developers.openai.com/api/docs/guides/tools-tool-search>:
  - available on the **Responses API** for `gpt-5.4` and later only, not on Chat Completions;
  - `{"type": "tool_search"}` plus `defer_loading: true` on functions (namespaces are recommended);
  - hosted or client-executed search (`execution: "client"`, answered with a `tool_search_output` item);
  - loaded tools go at the end of the context, preserving the cache.
- The catalogued `gpt-4.1-mini` on Chat Completions has no native deferral. The fallback is the same index in the
  prompt, with the loaded tools appended to the request's `tools`.
- **Prompt caching** is automatic for prefixes of 1024 tokens and more. `prompt_cache_key` routes requests that share
  a key and a prefix to the same cache.

### 1.5 Prompt caching rules (Anthropic)

From the claude-api skill (`shared/prompt-caching.md`, `shared/model-migration.md`):

- The cache is a byte prefix match in the order `tools` → `system` → `messages`; any change invalidates everything
  after it. A varying tool set, a per-request value in the system prompt and unsorted JSON are the classic silent
  invalidators.
- At most 4 breakpoints. Reads cost 0.1× input, 5-minute writes 1.25×.
- On Claude Sonnet 5.5 and Opus 5.5 ("preserved thinking"), **removing or editing anything in an earlier turn**
  invalidates every later thinking block and restarts the cache. History must be append-only across turns, not just
  within one.
- Adding tools mid-conversation is cache-safe only through tool search (`tool_reference` expansion) or the
  mid-conversation tool-changes beta.

### 1.6 Verified by experiment (2026-11-01, `claude-sonnet-5-5`)

- A custom `load_tools` tool whose `tool_result` content is **only** `tool_reference` blocks loads deferred tools. The
  model then calls the loaded tool, with no server search tool in the request.
- Mixing a text block with `tool_reference` blocks in one `tool_result` is a 400 ("Tool definitions/code execution
  functions cannot be mixed with other content").
- `count_tokens` accepts `defer_loading` tools and `tool_reference` results.
- A later turn calls a tool loaded in an earlier turn without reloading it, and reads the whole prefix from the cache
  (661 of 735 tokens).

### 1.7 Output-token discipline

- Effort controls thinking depth and spend; `medium` is the assistant's setting.
- A step's `max_tokens` is a hard cut. A step that hits it is an error here, because a truncated answer is never acted
  on. So the ceiling only bounds the reservation (what the allowance must have room for), not the bill.
- Lower ceilings let more steps fit a small allowance, but need a retry path for the rare long answer.

## 2. Where the tokens went (measured on develop, 2026-11-01)

`scripts/assistant-tokens.ts` counts each component with Anthropic's `count_tokens`; the briefing is a live fixture
(`scripts/fixtures/briefing-running.json`). `scripts/assistant-driver.ts` runs five typical questions against the
local engine with the live provider and prints steps, tokens and USD.

Per model step (claude-sonnet-5-5, `act` grant, before history):

| Component | Characters | Tokens |
|---|---:|---:|
| 33 tool definitions (41 for owner: 9,170) | 19,035 | 7,882 |
| System prompt (re-lists every tool, plus the game primer) | 16,819 | 5,564 |
| Briefing (rules 4k, helpers, panels, utility source) | 8,632 | 3,194 |
| **Total** | | **16,640** |

The cheapest single tool costs about 370 tokens alone. That is mostly the fixed tool-use preamble; the marginal cost
of a tool runs from about 20 tokens (`whoami`) to about 650 (`open_panel`).

Typical questions (five questions, one of them a follow-up in the same thread):

| Run | Model | Steps | Billed tokens per question | USD for 5 | Questions per 200k |
|---|---|---:|---:|---:|---:|
| develop (baseline) | claude-sonnet-5-5 | 10 | 14,733 | 0.171 | 13.6 |
| develop (baseline) | gpt-4.1-mini | 7 | 9,975 | 0.021 | 20.1 |

Two cache leaks showed in the baseline:

1. A follow-up in the same thread rewrote the previous turn into the cache: 8,285 tokens written for "How am I doing
   so far?". The history dropped earlier turns' briefings and thinking, so the prefix changed at every new turn.
2. OpenAI's `prompt_cache_key` was per thread, so a new thread's first step never read the shared system and tools
   prefix: 0 tokens read on three of five questions.

## 3. Design

### 3.1 History is append-only across turns (PR 1)

Every turn is replayed exactly as its steps sent it: its briefing, the model's thinking and raw tool input, and the
tool results. A new turn therefore reads the earlier ones from the prompt cache. Earlier turns are still cut whole
(oldest first) by the history size limit. The window's start is fixed once per turn (`historyStart`, stored as the
turn's `historyFromSeq`): it stays the previous turn's until the earlier turns outgrow the limits, then moves far
enough to leave half the limits, so a long thread restarts its cache once every several turns instead of on every
turn. The OpenAI cache key is a
hash of the stable prefix (system prompt and tool names), so every thread of a player shares one cache.

### 3.2 A lightweight tool index with a loader (PR 2)

- **Always on** (full schemas, the cached prefix): the tools nearly every question uses, plus the two loaders:
  - `get_observation`;
  - `open_panel` and `set_panel_params`;
  - `send_chat` (confirmed by the player);
  - `load_tools`;
  - `load_skill`.
- **Index**: every other tool the grant may use is one line in the system prompt, `name: short description`, with
  "(confirmed)" where a card asks the player. The short description is a required `short` field of every tool
  definition (≤ 100 characters, enforced by the type and the tools test).
- **`load_tools {names}`** loads full schemas for the rest of the thread (while the call stays in the history):
  - Anthropic: the request carries every tool. The non-core ones are `defer_loading: true`, and `load_tools` answers
    with `tool_reference` blocks that the API expands; the tool list never changes, so the cache holds.
  - OpenAI and the mock (no native deferral on Chat Completions): the adapter appends the tools named by
    `load_tools` results in the history to the core list, in load order. The list grows append-only, at most once
    per load.
  - The engine still runs any registry tool the grant permits. Loading saves context; it is not a permission
    boundary.
- **Skills** (`load_skill {name}`, a registry tool, so MCP and the CLI have it too) hold the domain knowledge that sat
  in the system prompt and the per-turn briefing. Each skill's body has static text plus live parts read as the
  player, and its name and one-line description sit in the index. A skill declares the tools its task calls; loading
  the skill loads them where the adapter manages context (OpenAI, mock):
  - `game-rules`: the game primer and the room's rules;
  - `writing-agents`: the agent workflow, the language's mutators and read helpers, and the player's utility source;
  - `screen`: panes, the built-in panel catalogue with parameters, and layout etiquette;
  - `game-setups`: setups and settings.
- **Briefing**: live state only. Phase, energy, economy, utility name and summary, the leaderboard line, and the panes
  on screen.
- **Step economy**:
  - the prompt says to answer from the briefing when it suffices;
  - the output ceiling drops from 8,192 to 2,048 tokens. It rises to 8,192 once a code-writing tool is loaded
    (validate or summon an agent, save a panel or a setup). A cut step is billed, never acted on, and run once more at
    the full ceiling;
  - reservations shrink with it.

### 3.3 MCP parity (PR 3)

`tools/list` serves the short descriptions, the deterministic registry order and accurate annotations, plus
`load_skill` for the long guidance. The server instructions name the skills index. Schemas stay in `tools/list`,
since the spec requires `inputSchema`; clients defer them as they choose, as Claude Code does.

### 3.4 Forward compatibility: a code-execution tool

A future `run_code` (a sandboxed analytics runtime, a separate task) needs no new architecture:

- a registry tool definition with its `short` line (it lands in the index, deferred);
- an executor;
- an `analytics-code` skill with the API it exposes and examples.

The index, `load_tools`, `load_skill`, MCP and the confirmation rules pick it up unchanged.

## 4. Results

| Run | Model | Steps | Billed tokens per question | USD for 5 | Questions per 200k |
|---|---|---:|---:|---:|---:|
| develop (baseline) | claude-sonnet-5-5 | 10 | 14,733 | 0.171 | 13.6 |
| develop (baseline) | gpt-4.1-mini | 7 | 9,975 | 0.021 | 20.1 |
| PR 1: append-only history, prefix cache key | claude-sonnet-5-5 | 8 | 11,502 | 0.133 | 17.4 |
| PR 1: append-only history, prefix cache key | gpt-4.1-mini | 7 | 6,083 | 0.013 | 32.9 |
| PR 2: tool index and loader, skills, live-only briefing, 2,048 ceiling | claude-sonnet-5-5 | 8 | 3,826 | 0.052 | 52.3 |
| PR 2: tool index and loader, skills, live-only briefing, 2,048 ceiling | gpt-4.1-mini | 10 | 3,328 | 0.007 | 60.1 |

Per model step after PR 2 (claude-sonnet-5-5, `act` grant, `count_tokens`), against 16,640 before:

| Component | Characters | Tokens |
|---|---:|---:|
| 6 loaded tools (loader + core; 29 deferred, not in context) | 5,156 | 2,396 |
| System prompt with the index (29 tools, 4 skills) | 7,219 | 2,366 |
| Briefing (live state only) | 1,026 | 450 |
| **Total** | | **5,212** |
| Skill when loaded: game-rules / writing-agents / screen / game-setups | | 2,821 / 2,223 / 1,446 / 330 |

What the live runs taught (both are in the design above):

- gpt-4.1-mini loaded the writing-agents skill, then looped on `get_observation` until the step ceiling: it did not
  follow the two-step "load, then call" protocol. Skills now declare their tools (like the Agent Skills spec's
  `allowed-tools`), and loading a skill loads them where the adapter manages context. On Anthropic the skill result
  must stay text (tool_reference blocks cannot share a result with text), so the body names its tools for load_tools;
  Claude Sonnet 5.5 also called a deferred tool named in the index directly, and the API accepted it.
- Without the primer's agent section, gpt-4.1-mini wrote `obj.value` for an Int object and failed validation. The
  primer moved to `lib/player-client/src/primer.ts`: AI seats still get all of it, and the assistant's
  writing-agents skill carries the agent, energy, commit-clause and determinism parts.

PR 1 alone: the same-thread follow-up now reads 20,499 tokens from the cache and writes 3,759 (was 13,382 and
8,285), and gpt-4.1-mini's new threads read the shared prefix (8,960 to 19,328 tokens read).

Reproduce:

```
pnpm --filter @workspace/engine dev            # in one shell
pnpm --filter @workspace/engine assistant:live # costs money
cd artifacts/engine
node --experimental-transform-types scripts/assistant-tokens.ts act [--per-tool]
node --experimental-transform-types scripts/assistant-driver.ts claude-sonnet-5-5   # or gpt-4.1-mini
pnpm --filter @workspace/engine assistant:mock
```
