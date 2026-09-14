/**
 * The `pi-subagents` package's `Agent` tool-result details — the shape the chat view renders when
 * the model (rather than the panel) started the run.
 *
 * This module must stay free of server-only imports: the chat view is a client component, and
 * pulling `lib/pi-subagents-bridge.ts` in here would drag the pi SDK into the browser bundle
 * (`Can't resolve 'child_process'` — measured, it 500s every page).
 */
export interface PiSubagentsAgentDetails {
  displayName: string;
  description: string;
  subagentType: string;
  status: string;
  toolUses: number;
  tokens: string;
  durationMs: number;
  activity?: string;
  modelName?: string;
  tags?: string[];
  turnCount?: number;
  maxTurns?: number;
  cost?: number;
  agentId?: string;
  error?: string;
}

/** Recognize the package's details without mistaking Pi Web's own for them. */
export function isPiSubagentsAgentDetails(value: unknown): value is PiSubagentsAgentDetails {
  if (typeof value !== "object" || value === null) return false;
  const details = value as Partial<PiSubagentsAgentDetails> & { kind?: unknown };
  if (details.kind !== undefined) return false; // pi-web's own subagent details carry `kind`
  return typeof details.subagentType === "string"
    && typeof details.agentId === "string"
    && typeof details.status === "string"
    && typeof details.toolUses === "number";
}
