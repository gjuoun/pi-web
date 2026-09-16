import { ok, safeTry } from "neverthrow";
import { listAllSessions } from "@/lib/session-reader";
import { searchSessionContents } from "@/lib/session-search";
import { fail } from "@/lib/result/failures";
import { failureResponse, respondJson } from "@/lib/result/route";
import { safeAsync } from "@/lib/result/safe";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length > 200) {
    return failureResponse(fail.badRequest("Search query exceeds 200 characters"));
  }

  const result = await safeTry(async function* () {
    // Paths come only from the same catalog used by the sidebar.
    let sessions: Awaited<ReturnType<typeof listAllSessions>> = [];
    if (query && !request.signal.aborted) {
      sessions = yield* safeAsync(() => listAllSessions()).mapErr(fail.internal);
    }
    const found = yield* safeAsync(() => searchSessionContents(sessions, query, request.signal))
      .mapErr(fail.internal);
    return ok(found);
  });

  return respondJson(request, result);
}
