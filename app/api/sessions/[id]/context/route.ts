import { SessionManager } from "@earendil-works/pi-coding-agent";
import { err, ok, safeTry } from "neverthrow";
import { resolveSessionPath, buildSessionContext } from "@/lib/session-reader";
import { getRpcSession } from "@/lib/rpc-manager";
import { fail } from "@/lib/result/failures";
import { respondJson } from "@/lib/result/route";
import { safeAsync, safeSync } from "@/lib/result/safe";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const leafId = url.searchParams.get("leafId") ?? undefined;
  const deferThinking = url.searchParams.has("deferThinking");
  const deferToolResultImages = url.searchParams.has("deferMedia");
  // `tail` caps the ancestor chain returned (default 50); `before` rewinds the
  // walk start to an older entry so the client can page upward without
  // re-fetching the whole active branch.
  const rawTail = Number(url.searchParams.get("tail"));
  const tail = Number.isFinite(rawTail) && rawTail > 0 ? Math.min(rawTail, 1000) : 50;
  const before = url.searchParams.get("before") ?? undefined;

  const result = await safeTry(async function* () {
    const rpc = getRpcSession(id);
    const liveRpc = rpc?.isAlive() ? rpc : undefined;
    const filePath = liveRpc
      ? null
      : yield* safeAsync(() => resolveSessionPath(id)).mapErr(fail.internal);
    if (!liveRpc && !filePath) {
      return err(fail.notFound("Session not found"));
    }

    const context = yield* safeSync(() => {
      const sm = liveRpc?.inner.sessionManager ?? SessionManager.open(filePath!);
      // `before` is the oldest entry already on the client; fetch its ancestors
      // only (excludeLeaf) so prepending the page does not duplicate `before`.
      return buildSessionContext(sm.getEntries() as never, before ?? leafId, {
        deferThinking,
        deferToolResultImages,
        tail,
        excludeLeaf: Boolean(before),
        sessionId: id,
      });
    }).mapErr(fail.internal);

    return ok({ context, tail, before: before ?? null });
  });

  return respondJson(req, result);
}
