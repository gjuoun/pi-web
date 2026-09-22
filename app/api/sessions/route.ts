import { ok, safeTry } from "neverthrow";
import {
  attachSessionProjectInfo,
  getSessionListVersion,
  listAllSessions,
  mergeSessionLists,
} from "@/lib/session-reader";
import {
  getCompletionNotificationSuppressedRpcSessionIds,
  getRpcSessionInfos,
  getRunningRpcSessionIds,
} from "@/lib/rpc-manager";
import { fail } from "@/lib/result/failures";
import { respondJson } from "@/lib/result/route";
import { safeAsync } from "@/lib/result/safe";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const result = await safeTry(async function* () {
    const searchParams = new URL(req.url).searchParams;
    const force = searchParams.get("force") === "1";
    const includeArchived = searchParams.get("includeArchived") === "1";
    const persistedSessionsPromise = listAllSessions({ force });
    // Capture before awaiting: mutations during the scan still require a later refresh.
    const sessionListVersion = getSessionListVersion();
    const [persistedSessions, runtimeSessions] = yield* safeAsync(() => Promise.all([
      persistedSessionsPromise,
      attachSessionProjectInfo(getRpcSessionInfos()),
    ])).mapErr(fail.internal);
    const merged = mergeSessionLists(persistedSessions, runtimeSessions);
    const sessions = includeArchived ? merged : merged.filter((session) => session.archived !== true);
    return ok({
      sessions,
      sessionListVersion,
      runningSessionIds: getRunningRpcSessionIds(),
      completionNotificationSuppressedSessionIds: getCompletionNotificationSuppressedRpcSessionIds(),
    });
  });

  return respondJson(req, result);
}
