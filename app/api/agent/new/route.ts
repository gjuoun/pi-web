import { err, ok, safeTry } from "neverthrow";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { allowFileRoot } from "@/lib/file-access";
import { invalidateSessionListCache } from "@/lib/session-reader";
import { startRpcSession } from "@/lib/rpc-manager";
import { fail, type ApiFailureOptions } from "@/lib/result/failures";
import { respondJson } from "@/lib/result/route";
import { safeAsync, safeRequestJson, safeSync } from "@/lib/result/safe";

const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

function parseThinkingLevel(value: unknown): ThinkingLevel | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && THINKING_LEVELS.has(value as ThinkingLevel)) {
    return value as ThinkingLevel;
  }
  throw new Error(`Invalid thinking level: ${String(value)}`);
}

// POST /api/agent/new  body: { cwd: string; type: string; message?: string; ... }
// Spawns a brand-new pi session. Most calls immediately send the first command;
// type:"ensure_session" only creates the runtime so clients can query commands.
// Returns pi's real session id plus the model/thinking state selected at startup.
export async function POST(req: Request) {
  let commandType: string | undefined;
  let promptAccepted = false;

  // Mirrors the old catch block: a prompt that never got accepted carries the
  // prompt_rejected augmentation on every failure path.
  const rejectionFields = (): ApiFailureOptions => ({
    fields: commandType === "prompt" && !promptAccepted
      ? { code: "prompt_rejected", accepted: false }
      : undefined,
  });

  const result = await safeTry(async function* () {
    const raw = yield* safeRequestJson(req).mapErr(fail.badRequest);
    const body = (typeof raw === "object" && raw !== null ? raw : {}) as {
      cwd?: unknown;
      [key: string]: unknown;
    };
    const { cwd, ...command } = body;
    commandType = typeof command.type === "string" ? command.type : undefined;

    if (!cwd || typeof cwd !== "string") {
      return err(fail.badRequest("cwd is required", rejectionFields()));
    }
    if (!existsSync(cwd)) {
      return err(fail.badRequest(`Directory does not exist: ${cwd}`, rejectionFields()));
    }

    // Use a one-time key so startRpcSession's lock doesn't conflict with real session ids
    const { provider, modelId, thinkingLevel, ...promptCommand } = command as {
      provider?: string;
      modelId?: string;
      thinkingLevel?: unknown;
      [key: string]: unknown;
    };
    if ((provider && !modelId) || (!provider && modelId)) {
      return err(fail.internal("provider and modelId must be provided together", rejectionFields()));
    }
    const explicitThinkingLevel = yield* safeSync(() => parseThinkingLevel(thinkingLevel))
      .mapErr((message) => fail.internal(message, rejectionFields()));

    // Must be unique per request: startRpcSession coalesces concurrent callers
    // that share a key onto one session. Date.now() (ms resolution) collides for
    // requests in the same millisecond, merging two new sessions into one.
    const tempKey = `__new__${randomUUID()}`;
    const { session, realSessionId } = yield* safeAsync(() => startRpcSession(tempKey, "", cwd, {
      ...(provider && modelId ? { initialModel: { provider, modelId } } : {}),
      ...(explicitThinkingLevel ? { thinkingLevel: explicitThinkingLevel } : {}),
    })).mapErr((message) => fail.internal(message, rejectionFields()));

    // Keep the files-route allowed-roots cache (see app/api/files/[...path]/route.ts)
    // in sync so the new cwd is immediately readable via /api/files. Without this,
    // a file request under a brand-new cwd would 403 for up to the cache TTL.
    allowFileRoot(cwd);
    invalidateSessionListCache();

    const state = yield* safeAsync(() => session.send({ type: "get_state" }) as Promise<{
      model?: { id: string; provider: string };
      thinkingLevel?: string;
    }>).mapErr((message) => fail.internal(message, rejectionFields()));

    if (promptCommand.type === "ensure_session") {
      return ok({
        success: true,
        sessionId: realSessionId,
        data: null,
        model: state.model
          ? { provider: state.model.provider, modelId: state.model.id }
          : null,
        thinkingLevel: state.thinkingLevel,
      });
    }

    const sent = yield* safeAsync(() => session.send(promptCommand))
      .mapErr((message) => fail.internal(message, rejectionFields()));
    promptAccepted = promptCommand.type === "prompt";

    return ok({
      success: true,
      sessionId: realSessionId,
      data: sent,
      model: state.model
        ? { provider: state.model.provider, modelId: state.model.id }
        : null,
      thinkingLevel: state.thinkingLevel,
    });
  });

  return respondJson(req, result);
}
