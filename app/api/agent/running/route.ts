import { ok } from "neverthrow";
import { getSessionListVersion } from "@/lib/session-reader";
import {
  getCompletionNotificationSuppressedRpcSessionIds,
  getRunningRpcSessionIds,
} from "@/lib/rpc-manager";
import { respondJson } from "@/lib/result/route";

export const dynamic = "force-dynamic";

// GET /api/agent/running - Lightweight snapshot for visible-tab polling.
// Note: `req` must stay a required positional param — Next 16's build-time route
// type check rejects `Request | undefined` signatures. Tests pass a Request explicitly.
export async function GET(req: Request) {
  return respondJson(req, ok({
    sessionListVersion: getSessionListVersion(),
    runningSessionIds: getRunningRpcSessionIds(),
    completionNotificationSuppressedSessionIds: getCompletionNotificationSuppressedRpcSessionIds(),
  }));
}
