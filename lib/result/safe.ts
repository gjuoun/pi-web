/**
 * safe* adapters — the only throw absorbers in the repo (wiki patterns/neverthrow rule 5).
 *
 * Everything that can throw from the outside world (JSON.parse, fs, request bodies) goes
 * through a named `safe*` function here and comes back as a `Result`/`ResultAsync` with a
 * plain string error. Business code maps those strings onto the `fail` catalog; no literal
 * `try`/`catch` is written outside this file (legacy routes excepted until migrated).
 */

import { promises as fsp } from "node:fs";
import { fromThrowable, type Result, ResultAsync } from "neverthrow";
import { errorMessage } from "./failures";

export function safeJsonParse<T = unknown>(raw: string): Result<T, string> {
  return fromThrowable(() => JSON.parse(raw) as T, errorMessage)();
}

export function safeSync<T>(fn: () => T): Result<T, string> {
  return fromThrowable(fn, errorMessage)();
}

export function safeReadFileText(path: string): ResultAsync<string, string> {
  return ResultAsync.fromPromise(fsp.readFile(path, "utf8"), errorMessage);
}

export function safeRequestJson(request: Request): ResultAsync<unknown, string> {
  return ResultAsync.fromPromise(request.json(), errorMessage);
}

/** Generic async absorber: wraps any promise-returning call whose throw would otherwise escape business code. */
export function safeAsync<T>(fn: () => Promise<T>): ResultAsync<T, string> {
  return ResultAsync.fromPromise(fn(), errorMessage);
}

/**
 * Errno-style sync outcome (wiki eliminate-try-catch#errno-style-apis): for APIs whose
 * callers only branch on "did it land" and the errno code. Call sites read `.ok`/`.code`
 * directly instead of unwrapping a Result.
 */
export type SyncOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string; readonly message: string };

export function trySync<T>(fn: () => T): SyncOutcome<T> {
  return fromThrowable(fn, (e): SyncOutcome<T> => ({
    ok: false,
    code: (e as NodeJS.ErrnoException)?.code ?? "UNKNOWN",
    message: errorMessage(e),
  }))().match(
    (value) => ({ ok: true as const, value }),
    (failure) => failure,
  );
}
