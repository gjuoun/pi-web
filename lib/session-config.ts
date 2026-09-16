import { err, ok, type Result } from "neverthrow";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

/**
 * SessionConfig — the single typed bundle a session is created with.
 *
 * Designed to be assembled from a preset directory (each config file read
 * separately and merged into one bundle): the cwd / initialModel /
 * thinkingLevel fields are consumed by `startRpcSession` today; personaPath,
 * extensions, skills and uiRenderers are the typed slots the future preset
 * loader fills.
 */

export interface SessionConfig {
  /** Working directory for a new session (absent when reopening by file). */
  readonly cwd?: string;
  /** Explicitly selected model — provider and modelId must be provided together. */
  readonly initialModel?: { provider: string; modelId: string };
  readonly allowInitialModelFallback?: boolean;
  readonly thinkingLevel?: ThinkingLevel;
  // ── preset slots (typed placeholders; nothing consumes them yet) ──
  readonly personaPath?: string;
  readonly extensions?: readonly string[];
  readonly skills?: readonly string[];
  readonly uiRenderers?: readonly string[];
}

/** Unvalidated input shape (e.g. an HTTP body or a preset manifest). */
export interface SessionConfigInput {
  cwd?: unknown;
  provider?: unknown;
  modelId?: unknown;
  thinkingLevel?: unknown;
  allowInitialModelFallback?: unknown;
  personaPath?: unknown;
  extensions?: unknown;
  skills?: unknown;
  uiRenderers?: unknown;
}

/** bad_request → HTTP 400 semantics; internal → HTTP 500 (preserves pre-refactor statuses). */
export type SessionConfigError =
  | { kind: "bad_request"; message: string }
  | { kind: "internal"; message: string };

const THINKING_LEVELS: ReadonlySet<string> = new Set([
  "off", "minimal", "low", "medium", "high", "xhigh", "max",
]);

function stringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as readonly string[])
    : undefined;
}

/** Validate and normalize raw input into a SessionConfig. Pure — no fs access. */
export function resolveSessionConfig(input: SessionConfigInput): Result<SessionConfig, SessionConfigError> {
  const cwd = typeof input.cwd === "string" && input.cwd.length > 0 ? input.cwd : undefined;
  if (!cwd) {
    return err({ kind: "bad_request", message: "cwd is required" });
  }

  const { provider, modelId } = input;
  if ((provider && !modelId) || (!provider && modelId)) {
    return err({ kind: "internal", message: "provider and modelId must be provided together" });
  }
  const initialModel = provider && modelId
    ? { provider: String(provider), modelId: String(modelId) }
    : undefined;

  let thinkingLevel: ThinkingLevel | undefined;
  if (input.thinkingLevel !== undefined) {
    if (typeof input.thinkingLevel === "string" && THINKING_LEVELS.has(input.thinkingLevel)) {
      thinkingLevel = input.thinkingLevel as ThinkingLevel;
    } else {
      return err({ kind: "internal", message: `Invalid thinking level: ${String(input.thinkingLevel)}` });
    }
  }

  return ok({
    cwd,
    initialModel,
    thinkingLevel,
    allowInitialModelFallback: input.allowInitialModelFallback === true ? true : undefined,
    personaPath: typeof input.personaPath === "string" ? input.personaPath : undefined,
    extensions: stringArray(input.extensions),
    skills: stringArray(input.skills),
    uiRenderers: stringArray(input.uiRenderers),
  });
}
