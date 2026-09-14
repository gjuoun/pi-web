import { NextResponse } from "next/server";
import { isPiSubagentsEngineReady, listPiSubagentRuns } from "@/lib/pi-subagents-bridge";

export const dynamic = "force-dynamic";

/**
 * Runs recorded for one session on the `pi-subagents` engine, newest first.
 *
 * `engineReady: false` means the package never announced itself in that session — either it is not
 * enabled in pi's settings, or the session was created without extensions. The panel says so
 * instead of looking empty.
 */
export async function GET(req: Request) {
  try {
    const sessionId = new URL(req.url).searchParams.get("sessionId");
    if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    return NextResponse.json(
      { engineReady: isPiSubagentsEngineReady(sessionId), runs: listPiSubagentRuns(sessionId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
