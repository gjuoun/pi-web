/**
 * Route error convention checker.
 *
 * Migrated routes render every error response through the kernel boundary
 * (`lib/result/route.ts`); an inline `return NextResponse.json({ error … })` /
 * `Response.json({ error … })` in a migrated route is a regression. Routes still on
 * the legacy pattern are enumerated in the allowlist carried by the test — migrating
 * a route means removing its allowlist entry, after which this checker enforces it.
 */

export interface RouteSource {
  readonly path: string;
  readonly source: string;
}

const INLINE_ERROR_RESPONSE = /return\s+(?:NextResponse|Response)\.json\(\s*\{\s*error/;

/** Returns the paths of the given route sources that inline an error response. */
export function findRouteViolations(files: RouteSource[]): string[] {
  return files.filter((file) => INLINE_ERROR_RESPONSE.test(file.source)).map((file) => file.path);
}
