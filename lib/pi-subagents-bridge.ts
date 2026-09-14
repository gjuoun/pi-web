import type { ExtensionContext, InlineExtension } from "@earendil-works/pi-coding-agent";
import { SUBAGENT_META_TYPE, SUBAGENT_RESULT_TYPE, SUBAGENT_STATUS_TYPE } from "./subagents";

/**
 * Bridge between Pi Web and the `pi-subagents` package that pi loads from its enabled package
 * entry (see docs/adr/0003). Nothing from the package is imported: runs are observed on the
 * `pi.events` bus, the live child session is reached through the package's manager registry, and
 * pi-web's own markers are written through that live session's SessionManager — never by opening
 * the file a second time.
 *
 * Registry: prefer `Symbol.for("pi-subagents:managers")` (per session, fork commit
 * `feat/per-session-manager-registry`) and fall back to `Symbol.for("pi-subagents:manager")` (the
 * single slot, first activation in the process). Without the per-session entry, every session after
 * the first resolves `undefined` — no `sessionFile` to stamp through and no live session to attach.
 */

const MANAGER_KEY = Symbol.for("pi-subagents:manager");
/**
 * Per-session view of the same entry, published by the patched package (fork commit
 * `feat/per-session-manager-registry`). The single slot above belongs to whichever activation
 * claimed it first, so in a long-lived host every later session must ask by its own session id.
 * Absent on an unpatched package — the fallback below keeps that case working.
 */
const MANAGERS_KEY = Symbol.for("pi-subagents:managers");
const READY_EVENT = "subagents:ready";

/** How long to wait for the record to expose its session file. Undocumented field, appears late. */
const ATTACH_TIMEOUT_MS = 20_000;
const ATTACH_INTERVAL_MS = 500;
/** The package owns these tool names; they are the ones the model may call. */
const SPAWN_CHANNEL = "subagents:rpc:spawn";

export type PiSubagentRunStatus =
  | "starting" | "running" | "completed" | "steered" | "aborted" | "stopped" | "error" | "unknown";

export interface PiSubagentRun {
  /** The package's own agent id (not a Pi session id). */
  runId: string;
  parentSessionId: string;
  profile: string;
  description: string;
  status: PiSubagentRunStatus;
  startedAt: string;
  completedAt?: string;
  sessionFile?: string;
  /** Pi session id of the child, known once the live session is attached. */
  childSessionId?: string;
  toolUses?: number;
  durationMs?: number;
  tokens?: number;
  cost?: number;
  result?: string;
  error?: string;
}

export interface PiSubagentSpawnOptions {
  description?: string;
  maxTurns?: number;
  runInBackground?: boolean;
  model?: string;
}

/**
 * The `details` the package attaches to its own `Agent` tool result — the shape a host renders when
 * the model (rather than the panel) started the run. It carries no session identity, so a card
 * built from it links to the child session only through the bridge's run map.
 */
export interface PiSubagentsAgentDetails {
  displayName: string;
  description: string;
  subagentType: string;
  status: string;
  toolUses: number;
  tokens: string;
  durationMs: number;
  activity?: string;
  modelName?: string;
  tags?: string[];
  turnCount?: number;
  maxTurns?: number;
  cost?: number;
  agentId?: string;
  error?: string;
}

/** Recognize the package's tool-result details without mistaking Pi Web's own for them. */
export function isPiSubagentsAgentDetails(value: unknown): value is PiSubagentsAgentDetails {
  if (typeof value !== "object" || value === null) return false;
  const details = value as Partial<PiSubagentsAgentDetails> & { kind?: unknown };
  if (details.kind !== undefined) return false; // pi-web's own subagent details carry `kind`
  return typeof details.subagentType === "string"
    && typeof details.agentId === "string"
    && typeof details.status === "string"
    && typeof details.toolUses === "number";
}

export interface PiSubagentsBridgeDeps {
  /** Parent pi-web session id, filled in once the wrapper exists (the factory runs earlier). */
  getParentSessionId: () => string | undefined;
  /** Parent session file path — required by pi-web's own `pi-web:subagent` marker. */
  getParentSessionFile: () => string | undefined;
  /**
   * Register the package's live child AgentSession with pi-web's wrapper registry, so
   * `/api/agent/<child>/events` streams the run that is actually executing. Attach only: opening
   * the file instead would put a second writer on it.
   */
  attachSession: (inner: unknown) => void;
}

interface BridgeHandle {
  isReady: () => boolean;
  list: () => PiSubagentRun[];
  spawn: (profile: string, task: string, options?: PiSubagentSpawnOptions) => Promise<{ runId: string }>;
}

declare global {
  var __piSubagentBridges: Map<string, BridgeHandle> | undefined;
}

function bridgeRegistry(): Map<string, BridgeHandle> {
  if (!globalThis.__piSubagentBridges) globalThis.__piSubagentBridges = new Map();
  return globalThis.__piSubagentBridges;
}

/** Runs recorded for one parent session, newest first. Backs the duplicated top-bar panel. */
export function listPiSubagentRuns(parentSessionId: string): PiSubagentRun[] {
  const runs = bridgeRegistry().get(parentSessionId)?.list() ?? [];
  return [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Whether the package announced itself in that session — the panel's "engine unavailable" state. */
export function isPiSubagentsEngineReady(parentSessionId: string): boolean {
  return bridgeRegistry().get(parentSessionId)?.isReady() ?? false;
}

/** Start a run through the package's RPC channel. Throws when the engine is not available. */
export async function spawnPiSubagent(
  parentSessionId: string,
  profile: string,
  task: string,
  options: PiSubagentSpawnOptions = {},
): Promise<{ runId: string }> {
  const handle = bridgeRegistry().get(parentSessionId);
  if (!handle) {
    throw new Error("The pi-subagents engine is not available in this session (is the package enabled in pi's settings?)");
  }
  if (!handle.isReady()) throw new Error("The pi-subagents engine has not announced itself in this session yet");
  return handle.spawn(profile, task, options);
}

type EventBus = {
  on: (event: string, handler: (data: unknown) => void) => unknown;
  emit: (event: string, data: unknown) => unknown;
};

interface RecordLike {
  sessionFile?: string;
  session?: { sessionId?: string; sessionManager?: { appendCustomEntry?: (type: string, data: unknown) => unknown } };
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null;
}

function stringField(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

function numberField(value: unknown, key: string): number | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" ? field : undefined;
}

/** Normalise the package's status vocabulary onto pi-web's. */
function normaliseStatus(status: unknown): PiSubagentRunStatus {
  switch (status) {
    case "queued": return "starting";
    case "running": return "running";
    case "completed": return "completed";
    case "steered": return "steered";
    case "aborted": return "aborted";
    case "stopped": return "stopped";
    case "error":
    case "failed":
      return "error";
    default: return "unknown";
  }
}

export function createPiSubagentsBridgeExtension(deps: PiSubagentsBridgeDeps): InlineExtension {
  return {
    name: "pi-web-pi-subagents-bridge",
    hidden: true,
    factory: (pi) => {
      const bus = pi.events as unknown as EventBus | undefined;
      if (!bus?.on || !bus.emit) return;

      let ready = false;
      const runs = new Map<string, PiSubagentRun>();
      const pendingSpawns = new Map<string, { resolve: (runId: string) => void; reject: (error: Error) => void }>();
      const attaching = new Set<string>();

      const manager = () => (globalThis as Record<symbol, unknown>)[MANAGER_KEY] as
        | { getRecord?: (id: string) => unknown }
        | undefined;
      const perSessionManager = () => {
        const map = (globalThis as Record<symbol, unknown>)[MANAGERS_KEY] as
          | Map<string, { getRecord?: (id: string) => unknown }>
          | undefined;
        const sessionId = deps.getParentSessionId();
        return sessionId ? map?.get(sessionId) : undefined;
      };
      const recordOf = (runId: string): RecordLike | undefined => {
        // Ask the per-session entry first: the single slot resolves ids for the first activation
        // in the process only, which is exactly what a multi-session host is not.
        const entry = perSessionManager() ?? manager();
        const record = entry?.getRecord?.(runId);
        return isRecord(record) ? record : undefined;
      };

      const stamp = (runId: string, customType: string, data: unknown): boolean => {
        const append = recordOf(runId)?.session?.sessionManager?.appendCustomEntry;
        if (typeof append !== "function") return false;
        try {
          append.call(recordOf(runId)?.session?.sessionManager, customType, data);
          return true;
        } catch {
          return false;
        }
      };

      const stampMeta = (run: PiSubagentRun): void => {
        const parentSessionId = deps.getParentSessionId();
        const parentSessionPath = deps.getParentSessionFile();
        if (!parentSessionId || !parentSessionPath) return;
        stamp(run.runId, SUBAGENT_META_TYPE, {
          version: 1,
          parentSessionId,
          parentSessionPath,
          parentToolCallId: "",
          profile: run.profile,
          description: run.description,
          task: "",
          runInBackground: true,
          createdAt: run.startedAt,
        });
        // Without a status entry the reader can only report "interrupted" for a child that has no
        // result yet, so a live run has to say so explicitly.
        stamp(run.runId, SUBAGENT_STATUS_TYPE, { version: 1, status: "running" });
      };

      const attach = async (run: PiSubagentRun): Promise<void> => {
        if (attaching.has(run.runId)) return;
        attaching.add(run.runId);
        const deadline = Date.now() + ATTACH_TIMEOUT_MS;
        try {
          while (Date.now() < deadline) {
            const record = recordOf(run.runId);
            if (record?.sessionFile) {
              run.sessionFile = record.sessionFile;
              run.childSessionId = record.session?.sessionId;
              stampMeta(run);
              if (record.session) deps.attachSession(record.session);
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, ATTACH_INTERVAL_MS));
          }
        } finally {
          attaching.delete(run.runId);
        }
      };

      const upsert = (runId: string, data: unknown, fallbackProfile = "unknown"): PiSubagentRun => {
        const existing = runs.get(runId);
        const next: PiSubagentRun = {
          runId,
          parentSessionId: existing?.parentSessionId ?? deps.getParentSessionId() ?? "",
          profile: existing?.profile ?? stringField(data, "type") ?? fallbackProfile,
          description: existing?.description ?? stringField(data, "description") ?? fallbackProfile,
          status: existing?.status ?? "starting",
          startedAt: existing?.startedAt ?? new Date().toISOString(),
          ...(existing?.completedAt ? { completedAt: existing.completedAt } : {}),
          ...(existing?.sessionFile ? { sessionFile: existing.sessionFile } : {}),
          ...(existing?.childSessionId ? { childSessionId: existing.childSessionId } : {}),
          ...(existing?.result ? { result: existing.result } : {}),
          ...(existing?.error ? { error: existing.error } : {}),
        };
        runs.set(runId, next);
        return next;
      };

      bus.on(READY_EVENT, () => {
        ready = true;
        const parentSessionId = deps.getParentSessionId();
        if (parentSessionId) bridgeRegistry().set(parentSessionId, handle);
      });

      bus.on("subagents:started", (data) => {
        const runId = stringField(data, "id");
        if (!runId) return;
        const run = upsert(runId, data);
        run.status = "running";
        void attach(run);
      });

      // The package emits `created` only for its own tool's background branch, so an RPC spawn's
      // first event is `started`; `created` is still recorded when it does arrive.
      bus.on("subagents:created", (data) => {
        const runId = stringField(data, "id");
        if (runId) upsert(runId, data);
      });

      const settle = (data: unknown, status: PiSubagentRunStatus): void => {
        const runId = stringField(data, "id");
        if (!runId) return;
        const run = upsert(runId, data);
        run.status = normaliseStatus(stringField(data, "status")) === "unknown" ? status : normaliseStatus(stringField(data, "status"));
        run.completedAt = new Date().toISOString();
        const result = stringField(data, "result");
        const error = stringField(data, "error");
        if (result !== undefined) run.result = result;
        if (error !== undefined) run.error = error;
        const toolUses = numberField(data, "toolUses");
        if (toolUses !== undefined) run.toolUses = toolUses;
        const durationMs = numberField(data, "durationMs");
        if (durationMs !== undefined) run.durationMs = durationMs;
        const tokens = numberField(data, "tokens");
        if (tokens !== undefined) run.tokens = tokens;
        stamp(runId, SUBAGENT_RESULT_TYPE, {
          version: 1,
          status: run.status === "error" ? "failed" : run.status === "completed" || run.status === "steered" ? "completed" : "aborted",
          completedAt: run.completedAt,
          ...(run.result !== undefined ? { result: run.result } : {}),
          ...(run.error !== undefined ? { error: run.error } : {}),
        });
      };

      bus.on("subagents:completed", (data) => settle(data, "completed"));
      bus.on("subagents:failed", (data) => settle(data, "error"));

      bus.on("subagents:steered", (data) => {
        const runId = stringField(data, "id");
        const run = runId ? runs.get(runId) : undefined;
        if (run && run.status === "running") run.status = "steered";
      });

      const handle: BridgeHandle = {
        isReady: () => ready,
        list: () => [...runs.values()],
        spawn: async (profile, task, options = {}) => {
          const requestId = `pi-web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const replyChannel = `${SPAWN_CHANNEL}:reply:${requestId}`;
          const reply = new Promise<string>((resolve, reject) => {
            pendingSpawns.set(requestId, { resolve, reject });
            setTimeout(() => {
              if (pendingSpawns.delete(requestId)) reject(new Error("The pi-subagents engine did not answer the spawn request"));
            }, ATTACH_TIMEOUT_MS);
          });
          bus.on(replyChannel, (data) => {
            const entry = pendingSpawns.get(requestId);
            if (!entry) return;
            pendingSpawns.delete(requestId);
            if (typeof data === "object" && data !== null && (data as { success?: unknown }).success === true) {
              const id = stringField((data as { data?: unknown }).data, "id");
              if (id) {
                upsert(id, { id, type: profile, description: options.description ?? profile });
                entry.resolve(id);
                return;
              }
            }
            const message = typeof data === "object" && data !== null && typeof (data as { error?: unknown }).error === "string"
              ? (data as { error: string }).error
              : "The pi-subagents engine rejected the spawn request";
            entry.reject(new Error(message));
          });
          bus.emit(SPAWN_CHANNEL, {
            requestId,
            type: profile,
            prompt: task,
            options: {
              description: options.description ?? profile,
              ...(options.maxTurns !== undefined ? { maxTurns: options.maxTurns } : {}),
              ...(options.runInBackground !== undefined ? { isBackground: options.runInBackground } : {}),
              ...(options.model ? { model: options.model } : {}),
            },
          });
          const runId = await reply;
          return { runId };
        },
      };
    },
  };
}

/** Test seam: drop every recorded bridge, so a fresh factory can claim a session id again. */
export function resetPiSubagentBridgesForTests(): void {
  bridgeRegistry().clear();
}

export type { ExtensionContext };
