import { ok } from "neverthrow";
import { getSessionListVersion } from "@/lib/session-reader";
import {
  getCompletionNotificationSuppressedRpcSessionIds,
  getRunningRpcSessionIds,
} from "@/lib/rpc-manager";
import { respondJson } from "@/lib/result/route";

export const dynamic = "force-dynamic";

// GET /api/agent/running - Lightweight snapshot for visible-tab polling.
// `req` is optional so tests can call the handler bare (runtime-route.test.mjs).
export async function GET(req: Request = new Request("http://localhost/")) {
  return respondJson(req, ok({
    sessionListVersion: getSessionListVersion(),
    runningSessionIds: getRunningRpcSessionIds(),
    completionNotificationSuppressedSessionIds: getCompletionNotificationSuppressedRpcSessionIds(),
  }));
}
