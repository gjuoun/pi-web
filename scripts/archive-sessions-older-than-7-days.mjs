#!/usr/bin/env node
// One-time archive backfill for JW-148's follow-up plan (Step 4):
// ~/.notebook/project/gjuoun/pi-web/plan/2026-09-23/jw-148-sidebar-followup/plan.md
//
// Marks every session with `modified` older than 7 days as archived — the
// same `pi-web:session-archived` custom entry the existing PATCH route
// writes (app/api/sessions/[id]/route.ts). Pinned and already-archived
// sessions are skipped. This is a single migration, NOT a recurring
// "auto-archive" feature — after this runs, archiving is manual again
// (JW-145's existing pin/archive UI).
//
// Usage:
//   node scripts/archive-sessions-older-than-7-days.mjs            # dry-run (default), writes nothing
//   node scripts/archive-sessions-older-than-7-days.mjs --dry-run  # same as above, explicit
//   node scripts/archive-sessions-older-than-7-days.mjs --apply    # actually writes the archive flag
//
// Idempotent: a second run only touches sessions that still qualify
// (already-archived sessions are excluded by the `archived !== true` filter).

import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { listAllSessions } = await jiti.import("../lib/session-reader.ts");
const { SESSION_ARCHIVED_TYPE } = await jiti.import("../lib/session-flags.ts");
const { SessionManager } = await jiti.import("@earendil-works/pi-coding-agent");

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function formatAge(modifiedIso, nowMs) {
  const ageMs = nowMs - new Date(modifiedIso).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return `${ageDays.toFixed(1)}d`;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  // --dry-run is the default; accepted explicitly too, and any other flag is ignored.
  const nowMs = Date.now();
  const cutoffMs = nowMs - SEVEN_DAYS_MS;

  const sessions = await listAllSessions({ force: true });
  const qualifying = sessions.filter((session) => {
    if (session.pinned === true) return false;
    if (session.archived === true) return false;
    return new Date(session.modified).getTime() < cutoffMs;
  });

  console.log(`Mode: ${apply ? "--apply (writing)" : "--dry-run (no writes)"}`);
  console.log(`Total sessions scanned: ${sessions.length}`);
  console.log(`Qualifying (older than 7 days, not pinned, not already archived): ${qualifying.length}`);

  if (qualifying.length > 0) {
    const sortedByAge = [...qualifying].sort(
      (a, b) => new Date(a.modified).getTime() - new Date(b.modified).getTime(),
    );
    const oldest = sortedByAge[0];
    const newest = sortedByAge[sortedByAge.length - 1];
    console.log(`Oldest qualifying session: ${formatAge(oldest.modified, nowMs)} old (${oldest.modified})`);
    console.log(`Newest qualifying session: ${formatAge(newest.modified, nowMs)} old (${newest.modified})`);

    console.log(`\nFirst ${Math.min(10, qualifying.length)} qualifying sessions:`);
    for (const session of qualifying.slice(0, 10)) {
      const title = session.name || session.firstMessage?.slice(0, 60) || session.id;
      console.log(`  - [${formatAge(session.modified, nowMs)}] ${title}`);
      console.log(`      id: ${session.id}`);
      console.log(`      path: ${session.path}`);
    }
  }

  if (!apply) {
    console.log("\nDry run only — no sessions were modified. Re-run with --apply to write.");
    return;
  }

  console.log(`\nApplying archive flag to ${qualifying.length} session(s)...`);
  let succeeded = 0;
  let failed = 0;
  for (const session of qualifying) {
    try {
      SessionManager.open(session.path).appendCustomEntry(SESSION_ARCHIVED_TYPE, true);
      succeeded += 1;
    } catch (error) {
      failed += 1;
      console.error(`  ✗ Failed to archive ${session.id} (${session.path}): ${error?.message ?? error}`);
    }
  }
  console.log(`Done: ${succeeded} archived, ${failed} failed.`);
}

await main();
