import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createJiti } from "jiti";

const { findRouteViolations } = await createJiti(import.meta.url).import("./convention.ts");

/**
 * Routes still on the legacy inline-error pattern. Migrating a route onto the
 * Result pipeline = removing its entry here; the real-tree test below then
 * enforces the kernel boundary for it. Keep this list sorted.
 */
const LEGACY_ALLOWLIST = new Set([
  "app/api/agent/[id]/bash-output/route.ts",
  "app/api/app-update/route.ts",
  "app/api/auth/api-key/[provider]/route.ts",
  "app/api/auth/login/[provider]/route.ts",
  "app/api/auth/logout/[provider]/route.ts",
  "app/api/auth/providers/route.ts",
  "app/api/cwd/browse/route.ts",
  "app/api/cwd/validate/route.ts",
  "app/api/default-cwd/route.ts",
  "app/api/file-index/route.ts",
  "app/api/files/[...path]/route.ts",
  "app/api/fonts/route.ts",
  "app/api/git/diff/route.ts",
  "app/api/git/status/route.ts",
  "app/api/home/route.ts",
  "app/api/models-config/catalog/route.ts",
  "app/api/models-config/discover/route.ts",
  "app/api/models-config/route.ts",
  "app/api/models-config/test/route.ts",
  "app/api/models/route.ts",
  "app/api/pi-subagents/runs/route.ts",
  "app/api/plugins/check/route.ts",
  "app/api/plugins/route.ts",
  "app/api/project-trust/route.ts",
  "app/api/provider-usage/query/route.ts",
  "app/api/push/config/route.ts",
  "app/api/push/subscribe/route.ts",
  "app/api/sessions/[id]/auto-name/route.ts",
  "app/api/sessions/[id]/entries/[entryId]/thinking/route.ts",
  "app/api/sessions/[id]/entries/[entryId]/tool-result-image/route.ts",
  "app/api/sessions/[id]/state/route.ts",
  "app/api/skills/check/route.ts",
  "app/api/skills/install/route.ts",
  "app/api/skills/route.ts",
  "app/api/skills/search/route.ts",
  "app/api/skills/update/route.ts",
  "app/api/terminal/[id]/events/route.ts",
  "app/api/terminal/[id]/route.ts",
  "app/api/terminal/route.ts",
  "app/api/tools/settings/route.ts",
  "app/api/web-auth/route.ts",
  "app/api/worktrees/route.ts",
]);

/** The migrated routes — these must never return to the allowlist. */
const MIGRATED = [
  "app/api/agent/[id]/events/route.ts",
  "app/api/agent/[id]/lease/route.ts",
  "app/api/agent/[id]/route.ts",
  "app/api/agent/new/route.ts",
  "app/api/agent/running/route.ts",
  "app/api/sessions/[id]/context/route.ts",
  "app/api/sessions/[id]/export/route.ts",
  "app/api/sessions/[id]/route.ts",
  "app/api/sessions/route.ts",
  "app/api/sessions/search/route.ts",
];

function walkRoutes(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkRoutes(full, found);
    else if (entry.name === "route.ts") found.push(full);
  }
  return found;
}

test("checker flags synthetic inline error responses in both constructors", () => {
  const flagged = findRouteViolations([
    { path: "a.ts", source: "  } catch (e) {\n    return NextResponse.json({ error: String(e) }, { status: 500 });\n  }" },
    { path: "b.ts", source: "return Response.json({\n  error: 'x',\n}, { status: 400 })" },
  ]);
  assert.deepEqual(flagged, ["a.ts", "b.ts"]);

  const clean = findRouteViolations([
    { path: "c.ts", source: "return respondJson(req, result);" },
    { path: "d.ts", source: "return NextResponse.json({ success: true, data: result });" },
    { path: "e.ts", source: "return NextResponse.json({ ok: true });" },
  ]);
  assert.deepEqual(clean, []);
});

test("no route outside the legacy allowlist inlines an error response", () => {
  const repo = process.cwd();
  const files = walkRoutes(join(repo, "app/api")).map((full) => ({
    path: full.slice(repo.length + 1),
    source: readFileSync(full, "utf8"),
  }));
  assert.ok(files.length >= 50, `expected to scan the route tree, found ${files.length}`);

  const offenders = findRouteViolations(files).filter((path) => !LEGACY_ALLOWLIST.has(path));
  assert.deepEqual(offenders, []);
});

test("migrated routes are enforced (present on disk, off the allowlist, clean)", () => {
  const repo = process.cwd();
  for (const path of MIGRATED) {
    assert.ok(!LEGACY_ALLOWLIST.has(path), `${path} must not be allowlisted`);
    assert.ok(existsSync(join(repo, path)), `${path} should exist`);
  }
  const files = MIGRATED.map((path) => ({ path, source: readFileSync(join(repo, path), "utf8") }));
  assert.deepEqual(findRouteViolations(files), []);
});

test("every allowlisted route still exists (the list cannot rot)", () => {
  const repo = process.cwd();
  for (const path of LEGACY_ALLOWLIST) {
    assert.ok(existsSync(join(repo, path)), `allowlisted route no longer exists: ${path}`);
  }
});
