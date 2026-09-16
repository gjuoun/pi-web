import { ok } from "neverthrow";
import { renewSessionLivenessLeases } from "@/lib/session-liveness";
import { respondJson } from "@/lib/result/route";

// POST /api/agent/[id]/lease - Renew selected-session SSE leases.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return respondJson(_req, ok({
    success: true,
    renewed: renewSessionLivenessLeases(id),
  }));
}
