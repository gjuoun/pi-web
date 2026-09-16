import { err, ok, safeTry } from "neverthrow";
import { resolveSessionPath } from "@/lib/session-reader";
import { startRpcSession, getRpcSession } from "@/lib/rpc-manager";
import { fail, type ApiFailureOptions } from "@/lib/result/failures";
import { respondJson } from "@/lib/result/route";
import { safeAsync, safeRequestJson } from "@/lib/result/safe";

// POST /api/agent/[id] - Send a command to an existing session
// Unexpected throws inside this handler (none of the steps throw by contract) would
// propagate to Next's framework error handler — fail-closed, on purpose.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
      type?: unknown;
      [key: string]: unknown;
    };
    commandType = typeof body.type === "string" ? body.type : undefined;

    // The tool-selection feature is gone; a stale client that still asks for it gets a
    // clean 4xx instead of falling through to the SDK's unknown-command error.
    if (body.type === "set_tools") {
      return err(fail.badRequest("Unsupported command: set_tools"));
    }

    // Fast path: already-running session
    const existing = getRpcSession(id);
    if (existing?.isAlive()) {
      const sent = yield* safeAsync(() => existing.send(body))
        .mapErr((message) => fail.internal(message, rejectionFields()));
      promptAccepted = body.type === "prompt";
      return ok(sent);
    }

    const filePath = yield* safeAsync(() => resolveSessionPath(id))
      .mapErr((message) => fail.internal(message, rejectionFields()));
    if (!filePath) {
      return err(fail.notFound("Session not found", {
        fields: commandType === "prompt" ? { code: "prompt_rejected", accepted: false } : undefined,
      }));
    }

    const { session } = yield* safeAsync(() => startRpcSession(id, filePath))
      .mapErr((message) => fail.internal(message, rejectionFields()));
    const sent = yield* safeAsync(() => session.send(body))
      .mapErr((message) => fail.internal(message, rejectionFields()));
    promptAccepted = body.type === "prompt";

    return ok(sent);
  });

  return respondJson(req, result, { wrapSuccess: true });
}

// GET /api/agent/[id] - Get current agent state
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await safeTry(async function* () {
    const session = getRpcSession(id);
    if (!session || !session.isAlive()) {
      return ok({ running: false });
    }

    const state = yield* safeAsync(() => session.send({ type: "get_state" }))
      .mapErr(fail.internal);
    return ok({ running: true, state });
  });

  return respondJson(_req, result);
}
