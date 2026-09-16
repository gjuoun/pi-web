/**
 * ApiFailure — the route-level failure catalog (wiki patterns/neverthrow rule 1–4).
 *
 * Errors are plain data: a tagged union on `code`, constructed only through the `fail`
 * catalog (no hand-written literals at call sites). `failures.ts` carries no HTTP
 * concerns beyond the status map — rendering lives in `./route.ts`.
 */

export type ApiFailureCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "unsupported_media_type"
  | "upstream"
  | "internal";

export interface ApiFailureOptions {
  /** Extra JSON fields merged into the error body (e.g. `{ code: "prompt_rejected", accepted: false }`). */
  readonly fields?: Readonly<Record<string, unknown>>;
  /** Extra response headers on top of the standard failure headers. */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface ApiFailure extends ApiFailureOptions {
  readonly code: ApiFailureCode;
  readonly message: string;
}

export const API_FAILURE_STATUS: Readonly<Record<ApiFailureCode, number>> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  upstream: 502,
  internal: 500,
};

type FailureFactory = (message: string, options?: ApiFailureOptions) => ApiFailure;

function factory(code: ApiFailureCode): FailureFactory {
  return (message, options = {}) => ({ code, message, ...options });
}

/** The single construction path for ApiFailure. Factories double as `.mapErr(fail.x)` mappers. */
export const fail = {
  badRequest: factory("bad_request"),
  unauthorized: factory("unauthorized"),
  notFound: factory("not_found"),
  conflict: factory("conflict"),
  payloadTooLarge: factory("payload_too_large"),
  unsupportedMediaType: factory("unsupported_media_type"),
  upstream: factory("upstream"),
  internal: factory("internal"),
} as const satisfies Record<string, FailureFactory>;

export function statusForFailure(failure: ApiFailure): number {
  return API_FAILURE_STATUS[failure.code];
}

/** Standard extraction of a thrown value into a message string (the old per-route inline). */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
