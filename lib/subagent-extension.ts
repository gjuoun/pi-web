import { Type } from "@earendil-works/pi-ai";
import {
  defineTool,
  type ExtensionContext,
  type InlineExtension,
  type LoadExtensionsResult,
} from "@earendil-works/pi-coding-agent";
import {
  SUBAGENT_CONTROL_TOOL_NAMES,
  type SubagentProfile,
  type SubagentRunInfo,
} from "./subagents";
import { MAX_SUBAGENT_INPUT_FILES } from "./subagent-input";

export const HOST_SUBAGENT_EXTENSION_NAME = "pi-web-subagents";
const HOST_SUBAGENT_EXTENSION_PATH = `<inline:${HOST_SUBAGENT_EXTENSION_NAME}>`;
const SUBAGENT_TOOL_NAMES = new Set<string>(SUBAGENT_CONTROL_TOOL_NAMES);
const LEGACY_SUBAGENT_PACKAGE_NAME = "pi-subagents";

export interface SubagentToolDetails {
  kind: "pi-web-subagent";
  sessionId: string;
  profile: string;
  description: string;
  status: SubagentRunInfo["status"];
  runInBackground: boolean;
  createdAt: string;
  completedAt?: string;
  error?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  worktreeCleanupError?: string;
}

export interface StartSubagentRequest {
  parentContext: ExtensionContext;
  parentToolCallId: string;
  profile: string;
  task: string;
  inputFiles?: string[];
  description: string;
  runInBackground?: boolean;
  model?: string;
  thinking?: string;
  maxTurns?: number;
  inheritContext?: boolean;
  isolation?: "worktree";
  signal?: AbortSignal;
  onUpdate?: (run: SubagentRunInfo) => void;
}

export interface ResumeSubagentRequest {
  parentContext: ExtensionContext;
  parentToolCallId: string;
  sessionId: string;
  task: string;
  description: string;
  runInBackground?: boolean;
  signal?: AbortSignal;
  onUpdate?: (run: SubagentRunInfo) => void;
}

export interface SubagentExecution {
  run: SubagentRunInfo;
  completion: Promise<SubagentRunInfo>;
}

export interface SubagentExtensionRuntime {
  start(request: StartSubagentRequest): Promise<SubagentExecution>;
  resume(request: ResumeSubagentRequest): Promise<SubagentExecution>;
  get(sessionId: string): Promise<SubagentRunInfo | null>;
  steer(sessionId: string, message: string): Promise<void>;
  notifyParent(run: SubagentRunInfo): Promise<void>;
}

export type SubagentProfileProvider = () => readonly SubagentProfile[];
export type SubagentEnabledProvider = () => boolean;

function agentTypeDescription(profiles: readonly SubagentProfile[]): string {
  const available = profiles.filter((profile) => profile.enabled);
  if (available.length === 0) return "No subagent profiles are currently enabled.";
  return available.map((profile) => {
    const details = [`Tools: ${profile.tools.length > 0 ? profile.tools.join(", ") : "none"}`];
    if (profile.model) details.push(`Model: ${profile.model}`);
    return `- ${profile.name}: ${profile.description} (${details.join("; ")})`;
  }).join("\n");
}

export function subagentToolDetails(run: SubagentRunInfo): SubagentToolDetails {
  return {
    kind: "pi-web-subagent",
    sessionId: run.sessionId,
    profile: run.profile,
    description: run.description,
    status: run.status,
    runInBackground: run.runInBackground,
    createdAt: run.createdAt,
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.error ? { error: run.error } : {}),
    ...(run.worktreePath ? { worktreePath: run.worktreePath } : {}),
    ...(run.worktreeBranch ? { worktreeBranch: run.worktreeBranch } : {}),
    ...(run.worktreeCleanupError ? { worktreeCleanupError: run.worktreeCleanupError } : {}),
  };
}

export function subagentFinalText(run: SubagentRunInfo): string {
  if (run.status === "starting" || run.status === "running") {
    return `Subagent ${run.sessionId} is ${run.status}.`;
  }
  if (run.status === "completed") return run.result?.trim() || "Subagent completed without text output.";
  if (run.status === "aborted") return `Subagent ${run.sessionId} was stopped.`;
  if (run.status === "interrupted") return `Subagent ${run.sessionId} was interrupted before completion.`;
  return `Subagent ${run.sessionId} failed: ${run.error ?? "Unknown error"}`;
}

export function createSubagentExtension(
  runtime: SubagentExtensionRuntime,
  getProfiles: SubagentProfileProvider,
  isEnabled: SubagentEnabledProvider = () => true,
): InlineExtension {
  return {
    name: HOST_SUBAGENT_EXTENSION_NAME,
    hidden: true,
    factory: (pi) => {
      if (!isEnabled()) return;
      const profiles = getProfiles().filter((profile) => profile.enabled);
      const profileNames = profiles.map((profile) => profile.name);
      const availableTypes = profileNames.length > 0 ? profileNames.join(", ") : "none";
      pi.registerTool(defineTool({
        name: "Agent",
        label: "Agent",
        description: `Delegate a focused task to a configured subagent. Each subagent runs as a full, inspectable Pi session. Use background mode for independent work and foreground mode when the result is needed immediately.\n\nAvailable agent types:\n${agentTypeDescription(profiles)}`,
        promptSnippet: "Delegate a focused task to an inspectable subagent session",
        promptGuidelines: [
          "Use Agent for a focused task that benefits from an isolated context.",
          "Use multiple background Agent calls in the same response for independent parallel work.",
          "Do not duplicate work already delegated to a running subagent.",
        ],
        executionMode: "parallel",
        parameters: Type.Object({
          subagent_type: Type.Optional(Type.String({ description: `Configured agent profile. Available types: ${availableTypes}. Default: general-purpose.` })),
          prompt: Type.String({ description: "The complete task for the subagent." }),
          resume: Type.Optional(Type.String({ description: "Existing subagent session ID to continue instead of creating a new session." })),
          input_files: Type.Optional(Type.Array(Type.String(), {
            description: "UTF-8 text files under the session cwd to include with the task.",
            maxItems: MAX_SUBAGENT_INPUT_FILES,
          })),
          description: Type.String({ description: "Short activity label shown in the UI." }),
          run_in_background: Type.Optional(Type.Boolean({ description: "Return immediately and notify this session when complete." })),
          model: Type.Optional(Type.String({ description: "Optional provider/modelId override." })),
          thinking: Type.Optional(Type.String({ description: "Optional thinking level override." })),
          max_turns: Type.Optional(Type.Number({ description: "Optional positive agent turn limit." })),
          inherit_context: Type.Optional(Type.Boolean({ description: "Include the parent session's active conversation context." })),
          isolation: Type.Optional(Type.String({ description: "Run the subagent in an isolated git worktree." })),
        }),
        async execute(toolCallId, params, signal, onUpdate, ctx) {
          try {
            const resume = params.resume?.trim();
            const execution = resume
              ? await runtime.resume({
                  parentContext: ctx,
                  parentToolCallId: toolCallId,
                  sessionId: resume,
                  task: params.prompt,
                  description: params.description,
                  ...(params.run_in_background !== undefined ? { runInBackground: params.run_in_background } : {}),
                  signal,
                  onUpdate: (run) => onUpdate?.({
                    content: [{ type: "text", text: `${run.profile}: ${run.description} (${run.status})` }],
                    details: subagentToolDetails(run),
                  }),
                })
              : await runtime.start({
              parentContext: ctx,
              parentToolCallId: toolCallId,
              profile: params.subagent_type ?? "general-purpose",
              task: params.prompt,
              ...(params.input_files ? { inputFiles: params.input_files } : {}),
              description: params.description,
              ...(params.run_in_background !== undefined ? { runInBackground: params.run_in_background } : {}),
              ...(params.model ? { model: params.model } : {}),
              ...(params.thinking ? { thinking: params.thinking } : {}),
              ...(params.max_turns ? { maxTurns: params.max_turns } : {}),
              ...(params.inherit_context !== undefined ? { inheritContext: params.inherit_context } : {}),
              ...(params.isolation === "worktree" ? { isolation: "worktree" as const } : {}),
              signal,
              onUpdate: (run) => onUpdate?.({
                content: [{ type: "text", text: `${run.profile}: ${run.description} (${run.status})` }],
                details: subagentToolDetails(run),
              }),
                });

            if (execution.run.runInBackground) {
              void execution.completion
                .then((run) => runtime.notifyParent(run))
                .catch((error) => {
                  console.error(
                    "[pi-web] failed to deliver subagent completion:",
                    error instanceof Error ? error.message : error,
                  );
                });
              return {
                content: [{ type: "text", text: `Subagent started in background. Session ID: ${execution.run.sessionId}. You will be notified when it completes.` }],
                details: subagentToolDetails(execution.run),
              };
            }

            const run = await execution.completion;
            return {
              content: [{ type: "text", text: subagentFinalText(run) }],
              details: subagentToolDetails(run),
              ...(run.status === "failed" ? { isError: true } : {}),
            };
          } catch (error) {
            return {
              content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
              details: undefined,
              isError: true,
            };
          }
        },
      }));

      pi.registerTool(defineTool({
        name: "get_subagent_result",
        label: "Get agent result",
        description: "Check an inspectable subagent session and retrieve its latest result.",
        parameters: Type.Object({
          agent_id: Type.String({ description: "Subagent session ID." }),
          wait: Type.Optional(Type.Boolean({ description: "Wait until the subagent finishes." })),
        }),
        async execute(_toolCallId, params, signal) {
          let run = await runtime.get(params.agent_id);
          if (!run) return { content: [{ type: "text", text: `Subagent not found: ${params.agent_id}` }], details: undefined, isError: true };
          while (params.wait && (run.status === "starting" || run.status === "running")) {
            await new Promise<void>((resolve, reject) => {
              const onAbort = () => {
                clearTimeout(timer);
                reject(new Error("Result wait aborted"));
              };
              const timer = setTimeout(() => {
                signal?.removeEventListener("abort", onAbort);
                resolve();
              }, 500);
              if (signal?.aborted) onAbort();
              else signal?.addEventListener("abort", onAbort, { once: true });
            });
            run = await runtime.get(params.agent_id);
            if (!run) return { content: [{ type: "text", text: `Subagent not found: ${params.agent_id}` }], details: undefined, isError: true };
          }
          return {
            content: [{ type: "text", text: subagentFinalText(run) }],
            details: subagentToolDetails(run),
            ...(run.status === "failed" ? { isError: true } : {}),
          };
        },
      }));

      pi.registerTool(defineTool({
        name: "steer_subagent",
        label: "Steer agent",
        description: "Send a steering message to a currently running subagent session.",
        parameters: Type.Object({
          agent_id: Type.String({ description: "Subagent session ID." }),
          message: Type.String({ description: "Instruction to inject after the current tool execution." }),
        }),
        async execute(_toolCallId, params) {
          try {
            await runtime.steer(params.agent_id, params.message);
            return { content: [{ type: "text", text: `Steering message sent to ${params.agent_id}.` }], details: undefined };
          } catch (error) {
            return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], details: undefined, isError: true };
          }
        },
      }));
    },
  };
}

/**
 * True when an extension is the `pi-subagents` package itself — the copy pi loads from the
 * enabled package entry, or a vendored copy of the same package.
 *
 * The source is matched after stripping the npm prefix *and* the scope: `npm:@tintinweb/pi-subagents`
 * otherwise splits to an empty package name, leaving only the path check to recognise it.
 */
export function isPiSubagentsPackageExtension(extension: {
  path: string;
  sourceInfo?: { source?: string };
}): boolean {
  const source = extension.sourceInfo?.source ?? "";
  const sourcePackage = source.replace(/^npm:/, "").replace(/^@[^/]+\//, "");
  const pathSegments = extension.path.replaceAll("\\", "/").split("/");
  return sourcePackage === LEGACY_SUBAGENT_PACKAGE_NAME
    || pathSegments.some((segment) => segment === LEGACY_SUBAGENT_PACKAGE_NAME);
}

/**
 * Both sub-agent engines are expected to run at once: pi-web's inline extension and the
 * `pi-subagents` package pi loads from the enabled package entry (see docs/adr/0003). The SDK then
 * reports a name collision for every tool they share, and each one is about a tool the model
 * already reaches through whichever extension registered first — an error the user cannot act on.
 *
 * This drops exactly those diagnostics and nothing else. No extension is ever removed: the package
 * keeps its tools, its bus and its runtime. A duplicated package copy stays visible on purpose —
 * it surfaces as a `Flag "--subagents-workflow-file" conflicts with …` error, which is the signal
 * that two copies are loaded and every RPC would be answered twice.
 */
export function suppressExpectedSubagentConflicts(base: LoadExtensionsResult): LoadExtensionsResult {
  if (base.errors.length === 0) return base;
  const packagePaths = new Set(base.extensions.filter(isPiSubagentsPackageExtension).map((e) => e.path));
  if (packagePaths.size === 0) return base;
  const errors = base.errors.filter((error) => {
    const involvesHost = error.path === HOST_SUBAGENT_EXTENSION_PATH || packagePaths.has(error.path);
    if (!involvesHost) return true;
    if (![...packagePaths].some((path) => error.error.endsWith(path))) return true;
    return ![...SUBAGENT_TOOL_NAMES].some((name) => error.error.startsWith(`Tool "${name}" conflicts with `));
  });
  return errors.length === base.errors.length ? base : { ...base, errors };
}
