import { err, ok } from "neverthrow";
import { createAgentEventStream } from "@/lib/agent-event-stream";
import { resolveSessionPath } from "@/lib/session-reader";
import { getRpcSession, startRpcSession } from "@/lib/rpc-manager";
import { fail } from "@/lib/result/failures";
import { failureResponse } from "@/lib/result/route";
import { safeAsync } from "@/lib/result/safe";

export const dynamic = "force-dynamic";

// GET /api/agent/[id]/events - SSE stream of agent events
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (req.signal.aborted) return new Response(null, { status: 204 });

  // Fast path: already-running session
  const session = getRpcSession(id);
  let sessionPromise;
  if (session?.isAlive()) {
    sessionPromise = Promise.resolve(session);
  } else {
    // A resolveSessionPath failure previously escaped this handler as a framework 500;
    // it now renders through the failure boundary. A startRpcSession rejection is
    // surfaced to the client by the stream itself as a synthetic `startup_error`
    // event (lib/agent-event-stream publishSession catch).
    const outcome = await safeAsync(() => resolveSessionPath(id))
      .mapErr(fail.internal)
      .andThen((path) => (path ? ok(path) : err(fail.notFound("Session not found"))));
    if (outcome.isErr()) return failureResponse(outcome.error);
    if (req.signal.aborted) return new Response(null, { status: 204 });
    sessionPromise = startRpcSession(id, outcome.value, undefined).then((result) => result.session);
  }

  const stream = createAgentEventStream(req, id, sessionPromise);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
