/**
 * The route rendering boundary — dumb and total (wiki patterns/neverthrow rule 7).
 *
 * Exactly one place turns a `Result<T, ApiFailure>` into an HTTP response. It always
 * resolves, never throws, and preserves the wire envelopes the client already depends on:
 * failure → `{ error: string, ...fields }` with the catalog status; success → the bare
 * body, or `{ success: true, data }` when `wrapSuccess` is set (the agent-command envelope).
 */

import type { Result } from "neverthrow";
import { jsonResponse } from "../json-response";
import { statusForFailure, type ApiFailure } from "./failures";

export interface RespondOptions {
  /** Wrap the success payload as `{ success: true, data }` (agent-command envelope). Default: bare body. */
  readonly wrapSuccess?: boolean;
}

export function respondJson<T>(
  request: Request,
  result: Result<T, ApiFailure>,
  options: RespondOptions = {},
): Response {
  if (result.isErr()) {
    return failureResponse(result.error);
  }
  // `ok(undefined)` would stringify to nothing — coerce to JSON `null` so the boundary stays total.
  const value = result.value === undefined ? null : result.value;
  const body = options.wrapSuccess ? { success: true, data: value } : value;
  return jsonResponse(request, body, { headers: { "Cache-Control": "no-store" } });
}

/** Failure-only rendering, for routes whose success side is not JSON (streams, SSE). */
export function failureResponse(failure: ApiFailure): Response {
  return new Response(
    JSON.stringify({ error: failure.message, ...(failure.fields ?? {}) }),
    {
      status: statusForFailure(failure),
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...(failure.headers ?? {}),
      },
    },
  );
}
