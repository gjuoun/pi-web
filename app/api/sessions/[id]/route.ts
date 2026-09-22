import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { err, ok, safeTry } from "neverthrow";
import {
  attachSessionProjectInfo,
  listAllSessions,
  mergeSessionLists,
  resolveSessionPath,
  resolveSessionIdByPath,
  invalidateSessionPathCache,
  invalidateSessionListCache,
  buildSessionContext,
  readSessionHeader,
} from "@/lib/session-reader";
import { sessionPathKey } from "@/lib/session-path";
import { getRpcSession, getRpcSessionInfos, type AgentSessionWrapper } from "@/lib/rpc-manager";
import { projectTreeForResponse } from "@/lib/project-tree";
import { computeSessionTotalActiveMs } from "@/lib/session-timing";
import { computeSessionStats } from "@/lib/session-stats";
import type { SessionEntry } from "@/lib/types";
import { readSubagentRun, readSubagentSessionResources, SUBAGENT_META_TYPE } from "@/lib/subagents";
import { SESSION_ARCHIVED_TYPE, SESSION_PINNED_TYPE } from "@/lib/session-flags";
import { fail } from "@/lib/result/failures";
import { respondJson } from "@/lib/result/route";
import { safeAsync, safeJsonParse, safeRequestJson, safeSync, trySync } from "@/lib/result/safe";

interface DetailPayloadInput {
  id: string;
  liveRpc?: AgentSessionWrapper;
  resolvedPath: string | null;
  deferThinking: boolean;
  deferToolResultImages: boolean;
  tail: number;
}

// Everything between opening the session file and assembling the response body.
// Kept as one function so the route's safeTry stays a linear pipeline; internal
// fallible steps degrade explicitly instead of throwing.
async function buildDetailPayload({
  id,
  liveRpc,
  resolvedPath,
  deferThinking,
  deferToolResultImages,
  tail,
}: DetailPayloadInput) {
  const sm = liveRpc?.inner.sessionManager ?? SessionManager.open(resolvedPath!);
  const filePath = liveRpc?.sessionFile || sm.getSessionFile() || resolvedPath || "";
  const entries = sm.getEntries();
  const leafId = sm.getLeafId();
  const tree = projectTreeForResponse(sm.getTree());
  const context = buildSessionContext(entries as never, leafId, {
    deferThinking,
    deferToolResultImages,
    tail,
    sessionId: id, // local: lazy URLs for historical tool-result images
  });
  const totalActiveMs = computeSessionTotalActiveMs(entries);
  // Cumulative usage over ALL entries, including history compacted away —
  // the same aggregation the SDK's getSessionStats() uses. Lets the client
  // keep monotonic token/cost counters across compaction and page reloads.
  const stats = computeSessionStats(entries as unknown as SessionEntry[]);
  const sessionName = sm.getSessionName();
  const firstUserEntry = entries.find((entry) => entry.type === "message" && entry.message.role === "user");
  const firstUserMessage = firstUserEntry?.type === "message" ? firstUserEntry.message : undefined;

  const header = sm.getHeader();
  // File mtime when available, header timestamp as the fallback.
  let modified = header?.timestamp ?? new Date().toISOString();
  modified = safeSync(() => statSync(filePath).mtime.toISOString()).unwrapOr(modified);
  const parentSessionId = header?.parentSession
    ? await resolveSessionIdByPath(header.parentSession)
    : undefined;
  const subagent = header
    ? readSubagentRun(entries as never, header.id, filePath)
    : null;
  // Only a subagent's profile-frozen tool list is reported here; normal sessions have no
  // pi-web tool policy any more.
  const toolNames = readSubagentSessionResources(entries as never)?.tools;
  const info = header ? (await attachSessionProjectInfo([{
    path: filePath,
    id: header.id,
    cwd: header.cwd ?? "",
    name: sessionName,
    created: header.timestamp,
    modified,
    messageCount: stats.totalMessages,
    firstMessage: firstUserMessage
      ? (() => {
          const c = (firstUserMessage as { content: unknown }).content;
          return typeof c === "string" ? c : (Array.isArray(c) ? (c.find((b: { type: string }) => b.type === "text") as { text: string } | undefined)?.text ?? "" : "") || "(no messages)";
        })()
      : "(no messages)",
    parentSessionId,
    ...(subagent
      ? { relation: { kind: "subagent" as const, parentSessionId: subagent.parentSessionId, profile: subagent.profile, description: subagent.description, status: liveRpc?.isRunning() ? "running" as const : subagent.status } }
      : header.parentSession
        ? { relation: { kind: "fork" as const, ...(parentSessionId ? { originSessionId: parentSessionId } : {}) } }
        : {}),
    transient: !filePath || !existsSync(filePath),
  }]))[0] : null;

  return {
    sessionId: id,
    filePath,
    info,
    leafId,
    tree,
    context,
    stats,
    totalActiveMs,
    ...(toolNames !== undefined ? { toolNames } : {}),
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const searchParams = new URL(req.url).searchParams;
  const deferThinking = searchParams.has("deferThinking");
  const deferToolResultImages = searchParams.has("deferMedia");
  const rawTail = Number(searchParams.get("tail"));
  const tail = Number.isFinite(rawTail) && rawTail > 0 ? Math.min(rawTail, 1000) : 50;

  const result = await safeTry(async function* () {
    const rpc = getRpcSession(id);
    const liveRpc = rpc?.isAlive() ? rpc : undefined;
    const resolvedPath = liveRpc
      ? null
      : yield* safeAsync(() => resolveSessionPath(id)).mapErr(fail.internal);
    if (!liveRpc && !resolvedPath) {
      return err(fail.notFound("Session not found"));
    }

    const payload = yield* safeAsync(() => buildDetailPayload({
      id,
      liveRpc,
      resolvedPath,
      deferThinking,
      deferToolResultImages,
      tail,
    })).mapErr(fail.internal);
    return ok(payload);
  });

  return respondJson(req, result);
}

// PATCH /api/sessions/[id]  body: { name?: string; pinned?: boolean; archived?: boolean }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await safeTry(async function* () {
    const raw = yield* safeRequestJson(req).mapErr(fail.badRequest);
    const { name, pinned, archived } = (typeof raw === "object" && raw !== null ? raw : {}) as {
      name?: unknown;
      pinned?: unknown;
      archived?: unknown;
    };
    const hasName = typeof name === "string";
    const hasPinned = typeof pinned === "boolean";
    const hasArchived = typeof archived === "boolean";
    if (!hasName && !hasPinned && !hasArchived) {
      return err(fail.badRequest("name, pinned, or archived is required"));
    }
    const filePath = yield* safeAsync(() => resolveSessionPath(id)).mapErr(fail.internal);
    if (!filePath) {
      return err(fail.notFound("Session not found"));
    }
    yield* safeSync(() => {
      if (hasName) SessionManager.open(filePath).appendSessionInfo((name as string).trim());
      if (hasPinned) SessionManager.open(filePath).appendCustomEntry(SESSION_PINNED_TYPE, pinned);
      if (hasArchived) SessionManager.open(filePath).appendCustomEntry(SESSION_ARCHIVED_TYPE, archived);
    }).mapErr(fail.internal);
    invalidateSessionListCache();
    return ok({ ok: true });
  });

  return respondJson(req, result);
}

// DELETE /api/sessions/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await safeTry(async function* () {
    const filePath = yield* safeAsync(() => resolveSessionPath(id)).mapErr(fail.internal);
    if (!filePath) {
      return err(fail.notFound("Session not found"));
    }

    // Read only the bounded header before deleting.
    // Empty runtime sessions have a cached path before their first disk write.
    const ownHeader = trySync(() => readSessionHeader(filePath));
    if (!ownHeader.ok && ownHeader.code !== "ENOENT") {
      return err(fail.internal(ownHeader.message));
    }
    const parentSessionPath = ownHeader.ok ? ownHeader.value?.parentSession : undefined;
    // The parent may have been deleted or moved already; treat it as absent.
    const parentHeader = parentSessionPath
      ? trySync(() => readSessionHeader(parentSessionPath))
      : undefined;
    const parentSessionId = parentHeader?.ok ? parentHeader.value?.id : undefined;

    const targetPathKey = sessionPathKey(filePath);
    const dir = dirname(filePath);
    // Deleting a session also deletes every persisted or live subagent below it.
    const sessions = mergeSessionLists(
      yield* safeAsync(() => listAllSessions({ force: true })).mapErr(fail.internal),
      getRpcSessionInfos({ includeTransient: true }),
    );
    const childrenByParent = new Map<string, string[]>();
    for (const session of sessions) {
      if (session.relation?.kind !== "subagent") continue;
      const children = childrenByParent.get(session.relation.parentSessionId) ?? [];
      children.push(session.id);
      childrenByParent.set(session.relation.parentSessionId, children);
    }
    const sessionPaths = new Map(sessions.map((session) => [session.id, session.path]));
    // Include local files even when the global catalogue is stale or incomplete.
    const dirListing = trySync(() => readdirSync(dir));
    if (dirListing.ok) {
      for (const file of dirListing.value.filter((name) => name.endsWith(".jsonl"))) {
        const childPath = join(dir, file);
        if (sessionPathKey(childPath) === targetPathKey) continue;
        // Skip malformed or concurrently removed sessions.
        const child = trySync(() => readFileSync(childPath, "utf8"));
        if (!child.ok) continue;
        const lines = child.value.split("\n");
        const header = safeJsonParse<{ type?: string; id?: string }>(lines[0]);
        if (!header.isOk() || header.value.type !== "session" || typeof header.value.id !== "string") continue;
        const entries = lines.slice(1).flatMap((line) => {
          const parsed = safeJsonParse<SessionEntry>(line);
          return parsed.isOk() ? [parsed.value] : [];
        });
        const subagent = readSubagentRun(entries, header.value.id, childPath);
        if (!subagent) continue;
        const children = childrenByParent.get(subagent.parentSessionId) ?? [];
        children.push(header.value.id);
        childrenByParent.set(subagent.parentSessionId, children);
        sessionPaths.set(header.value.id, childPath);
      }
    }
    const deletedSessionIds = new Set<string>([id]);
    const pending = [id];
    while (pending.length > 0) {
      const parentId = pending.pop()!;
      for (const childId of childrenByParent.get(parentId) ?? []) {
        if (deletedSessionIds.has(childId)) continue;
        deletedSessionIds.add(childId);
        pending.push(childId);
      }
    }
    const deletedPaths = new Map<string, string>([[id, filePath]]);
    for (const deletedId of deletedSessionIds) {
      const sessionPath = sessionPaths.get(deletedId);
      if (sessionPath) deletedPaths.set(deletedId, sessionPath);
    }
    for (const deletedId of deletedSessionIds) {
      if (deletedPaths.has(deletedId)) continue;
      const runtimePath = getRpcSession(deletedId)?.sessionFile;
      if (runtimePath) deletedPaths.set(deletedId, runtimePath);
      else {
        const resolvedPath = yield* safeAsync(() => resolveSessionPath(deletedId)).mapErr(fail.internal);
        if (resolvedPath) deletedPaths.set(deletedId, resolvedPath);
      }
    }
    const deletedPathKeys = new Set([...deletedPaths.values()].map((path) => sessionPathKey(path)));

    // Re-attach all direct children to this session's parent (cascade re-parent)
    // Scan sibling files in the same directory
    const reparentListing = trySync(() => readdirSync(dir));
    if (reparentListing.ok) {
      const files = reparentListing.value.filter(
        (file) => file.endsWith(".jsonl") && sessionPathKey(join(dir, file)) !== targetPathKey,
      );
      for (const file of files) {
        const childPath = join(dir, file);
        if (deletedPathKeys.has(sessionPathKey(childPath))) continue;
        // Skip malformed files.
        const content = trySync(() => readFileSync(childPath, "utf8"));
        if (!content.ok) continue;
        const lines = content.value.split("\n");
        const header = safeJsonParse<{ type?: string; parentSession?: string }>(lines[0]);
        if (
          !header.isOk()
          || header.value.type !== "session"
          || !header.value.parentSession
          || sessionPathKey(header.value.parentSession) !== targetPathKey
        ) continue;
        // Rewrite header with new parentSession
        header.value.parentSession = parentSessionPath;
        lines[0] = JSON.stringify(header.value);
        if (parentSessionPath && parentSessionId) {
          for (let index = 1; index < lines.length; index += 1) {
            const entry = safeJsonParse<{ type?: string; customType?: string; data?: unknown }>(lines[index]);
            if (!entry.isOk()) continue;
            if (
              entry.value.type !== "custom"
              || entry.value.customType !== SUBAGENT_META_TYPE
              || typeof entry.value.data !== "object"
              || entry.value.data === null
              || Array.isArray(entry.value.data)
            ) continue;
            entry.value.data = {
              ...entry.value.data,
              parentSessionId,
              parentSessionPath,
            };
            lines[index] = JSON.stringify(entry.value);
            break;
          }
        }
        trySync(() => writeFileSync(childPath, lines.join("\n")));
      }
    }

    for (const deletedId of [...deletedSessionIds].reverse()) {
      if (deletedId === id) continue;
      // Shutting the wrapper down stops an attached child; a detached package run is the
      // engine's own business (docs/adr/0006).
      yield* safeAsync(() => getRpcSession(deletedId)?.shutdown() ?? Promise.resolve())
        .mapErr(fail.internal);
    }
    yield* safeAsync(() => getRpcSession(id)?.shutdown() ?? Promise.resolve())
      .mapErr(fail.internal);
    for (const [deletedId, deletedPath] of deletedPaths) {
      const removed = trySync(() => unlinkSync(deletedPath));
      if (!removed.ok && removed.code !== "ENOENT") {
        return err(fail.internal(removed.message));
      }
      invalidateSessionPathCache(deletedId);
    }
    invalidateSessionListCache();
    return ok({ ok: true });
  });

  return respondJson(_req, result);
}
