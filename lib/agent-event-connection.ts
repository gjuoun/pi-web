import type { AgentEventLike } from "./agent-event-wire";

export interface AgentEventSourceLike {
  readonly readyState: number;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  close(): void;
}

export type AgentEventConnectionStatus = "ready_timeout" | "startup_error" | "closed";

export class AgentEventConnectionError extends Error {
  constructor(public readonly status: AgentEventConnectionStatus, message?: string) {
    super(message ?? (
      status === "ready_timeout"
        ? "Timed out starting the agent session. Please try again."
        : "Failed to connect to the agent event stream. Please try again."
    ));
    this.name = "AgentEventConnectionError";
  }
}

type Attempt = {
  promise: Promise<void>;
  ready: boolean;
  succeed(): void;
  fail(error: AgentEventConnectionError): void;
};

type Connection = {
  sessionId: string;
  source: AgentEventSourceLike;
  attempt: Attempt;
};

export interface AgentEventConnectionOptions {
  createSource(sessionId: string): AgentEventSourceLike;
  onEvent(event: AgentEventLike): void;
  /**
   * Extra demand beyond the holders registered through `acquire`. Optional: a connection that is
   * held needs no external opinion, and a predicate that reads another effect's flag is exactly the
   * coupling `acquire`/`release` exists to remove.
   */
  shouldMaintain?(sessionId: string): boolean;
  readinessTimeoutMs: number;
  reconnectDelayMs: number;
  /**
   * How long a connection stays open after its last holder releases. React's StrictMode
   * double-mount arrives as acquire → release → acquire, so an immediate close would tear down a
   * stream the very next line re-opens.
   */
  releaseGraceMs?: number;
  onUnexpectedError?(error: unknown): void;
}

const EVENT_SOURCE_OPEN = 1;
const DEFAULT_RELEASE_GRACE_MS = 50;

/** Owns the EventSource, agent-readiness handshake, and passive reconnect. */
export class AgentEventConnection {
  private current: Connection | null = null;
  private retry: { sessionId: string; timer: ReturnType<typeof setTimeout> } | null = null;
  private retryGeneration = 0;
  /** Session the holders below belong to; `null` when nothing is held. */
  private heldSessionId: string | null = null;
  private holders = 0;
  private idleCloseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: AgentEventConnectionOptions) {}

  /**
   * Register a holder for `sessionId` and keep a connection alive while at least one holder exists.
   * Returns an idempotent release. Acquiring a different session switches immediately, and a
   * release issued for a superseded session can never close the newer one.
   */
  acquire(sessionId: string): () => void {
    if (this.heldSessionId !== sessionId) {
      this.clearIdleClose();
      this.holders = 0;
      this.heldSessionId = sessionId;
      if (this.current && this.current.sessionId !== sessionId) this.close();
    }
    this.clearIdleClose();
    this.holders += 1;
    const acquiredSessionId = sessionId;
    let released = false;

    this.connectHeld(sessionId);

    return () => {
      if (released) return;
      released = true;
      if (this.heldSessionId !== acquiredSessionId) return;
      this.holders = Math.max(0, this.holders - 1);
      if (this.holders > 0) return;
      this.scheduleIdleClose(acquiredSessionId);
    };
  }

  /** Whether `sessionId` currently has holders — the manager's own demand signal. */
  private isHeld(sessionId: string): boolean {
    return this.holders > 0 && this.heldSessionId === sessionId;
  }

  private connectHeld(sessionId: string): void {
    const retryGeneration = this.retryGeneration;
    void this.ensureConnected(sessionId).catch((error) => {
      if (retryGeneration !== this.retryGeneration) return;
      if (!this.isHeld(sessionId)) return;
      if (error instanceof AgentEventConnectionError) {
        if (error.status !== "startup_error") this.scheduleRetry(sessionId);
      } else {
        this.options.onUnexpectedError?.(error);
      }
    });
  }

  private scheduleIdleClose(sessionId: string): void {
    this.clearIdleClose();
    const graceMs = this.options.releaseGraceMs ?? DEFAULT_RELEASE_GRACE_MS;
    this.idleCloseTimer = setTimeout(() => {
      this.idleCloseTimer = null;
      if (this.holders > 0 || this.heldSessionId !== sessionId) return;
      this.heldSessionId = null;
      this.close();
    }, graceMs);
  }

  private clearIdleClose(): void {
    if (this.idleCloseTimer === null) return;
    clearTimeout(this.idleCloseTimer);
    this.idleCloseTimer = null;
  }

  /**
   * Close the live connection. With a `sessionId` it closes only that session's stream, so a late
   * caller holding a stale id can never drop the stream a newer session already opened.
   */
  close(sessionId?: string): void {
    if (sessionId !== undefined && this.current?.sessionId !== sessionId) return;
    this.stopRetrying();
    if (this.current) this.discard(this.current, new AgentEventConnectionError("closed"));
  }

  maintain(sessionId: string): void {
    if (!this.wants(sessionId)) return;
    const retryGeneration = this.retryGeneration;
    void this.ensureConnected(sessionId).catch((error) => {
      if (retryGeneration !== this.retryGeneration) return;
      if (error instanceof AgentEventConnectionError) {
        if (error.status === "startup_error") this.stopRetrying();
        else this.scheduleRetry(sessionId);
      } else {
        this.options.onUnexpectedError?.(error);
      }
    });
  }

  async ensureConnected(sessionId: string): Promise<void> {
    while (true) {
      let connection = this.current;
      if (!connection || connection.sessionId !== sessionId) {
        connection = this.open(sessionId);
      } else if (
        connection.attempt.ready
        && connection.source.readyState === EVENT_SOURCE_OPEN
      ) {
        return;
      }

      await connection.attempt.promise;
      if (this.current !== connection) {
        if (this.current?.sessionId === sessionId) continue;
        throw new AgentEventConnectionError("closed");
      }
      if (connection.source.readyState === EVENT_SOURCE_OPEN) return;

      // A once-ready EventSource may otherwise remain CONNECTING indefinitely.
      this.discard(connection, new AgentEventConnectionError("closed"));
    }
  }

  private open(sessionId: string): Connection {
    if (this.current) this.discard(this.current, new AgentEventConnectionError("closed"));

    let source: AgentEventSourceLike;
    try {
      source = this.options.createSource(sessionId);
    } catch (error) {
      throw new AgentEventConnectionError(
        "closed",
        error instanceof Error ? error.message : String(error),
      );
    }

    let settled = false;
    let resolve!: () => void;
    let reject!: (error: AgentEventConnectionError) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const timeout = setTimeout(() => {
      this.fail(connection, new AgentEventConnectionError("ready_timeout"));
    }, this.options.readinessTimeoutMs);
    const attempt: Attempt = {
      promise,
      ready: false,
      succeed() {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      },
      fail(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      },
    };
    const connection: Connection = { sessionId, source, attempt };
    this.current = connection;

    source.onmessage = (message) => {
      if (this.current !== connection) return;
      let event: AgentEventLike;
      try {
        event = JSON.parse(message.data) as AgentEventLike;
      } catch {
        return;
      }

      if (event.type === "connected") {
        attempt.ready = true;
        attempt.succeed();
        this.stopRetrying();
      } else if (event.type === "startup_error") {
        const message = typeof event.errorMessage === "string" ? event.errorMessage : undefined;
        this.fail(connection, new AgentEventConnectionError("startup_error", message));
        return;
      }
      this.options.onEvent(event);
    };
    source.onerror = () => {
      this.fail(connection, new AgentEventConnectionError("closed"));
    };

    return connection;
  }

  private fail(connection: Connection, error: AgentEventConnectionError): void {
    if (this.current !== connection) return;
    this.discard(connection, error);
    if (error.status === "startup_error") this.stopRetrying();
    else this.scheduleRetry(connection.sessionId);
  }

  private discard(connection: Connection, error: AgentEventConnectionError): void {
    connection.attempt.fail(error);
    connection.source.close();
    if (this.current === connection) this.current = null;
  }

  /** Demand for a session: a registered holder, or the optional external predicate. */
  private wants(sessionId: string): boolean {
    return this.isHeld(sessionId) || (this.options.shouldMaintain?.(sessionId) ?? false);
  }

  private scheduleRetry(sessionId: string): void {
    if (!this.wants(sessionId)) return;
    if (this.retry?.sessionId === sessionId) return;
    this.clearRetry();

    const timer = setTimeout(() => {
      if (this.retry?.timer !== timer) return;
      this.retry = null;
      this.maintain(sessionId);
    }, this.options.reconnectDelayMs);
    this.retry = { sessionId, timer };
  }

  private stopRetrying(): void {
    this.retryGeneration += 1;
    this.clearRetry();
  }

  private clearRetry(): void {
    if (this.retry) clearTimeout(this.retry.timer);
    this.retry = null;
  }
}
