import { ok, safeTry } from "neverthrow";
import { completeDirectories } from "@/lib/directory-browser";
import { getAllowedFileRoots, isFilePathAllowed } from "@/lib/file-access";
import { fail } from "@/lib/result/failures";
import { respondJson } from "@/lib/result/route";
import { safeAsync } from "@/lib/result/safe";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// GET /api/cwd/complete?q=&limit= — directory autocomplete for the picker.
// `allowed` mirrors the /api/files gate so the client only previews roots the
// explorer is actually permitted to list; this route never widens them.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  const requested = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const result = await safeTry(async function* () {
    const completion = yield* safeAsync(() => completeDirectories(query, limit)).mapErr(fail.internal);
    const allowedRoots = yield* safeAsync(() => getAllowedFileRoots()).mapErr(fail.internal);
    const allowed = completion.base !== null && isFilePathAllowed(completion.base, allowedRoots);
    return ok({ ...completion, allowed });
  });

  return respondJson(request, result);
}
