/**
 * Tool-name predicates shared by the chat views.
 *
 * Pi's built-in names are plain `write` / `edit`, but MCP servers expose the
 * same operations under prefixed or namespaced names, so each predicate also
 * accepts the common decorated forms.
 */

export function isWriteToolName(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name === "write" ||
    name.startsWith("write_") ||
    name.endsWith(".write") ||
    name.endsWith("_write");
}

export function isEditToolName(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name === "edit" ||
    name.startsWith("edit_") ||
    name.endsWith(".edit") ||
    name.endsWith("_edit") ||
    name.includes("str_replace") ||
    name.includes("replace_editor");
}

/**
 * Tools this fork ships itself.
 *
 * Treated the way the host treats its own inline tools — the chat view knows
 * them by name (`pi-web-subagent` is handled the same way for subagent cards in
 * `MessageView`). `jun_code` is our code-mode tool and its payload argument IS
 * code, so it renders as a highlighted code block instead of the argument JSON.
 *
 * No schema lookup, no media-type parsing, nothing inferred from the value.
 */
export const JUN_CODE_TOOL_NAME = "jun_code";

/** `jun_code` runs TypeScript, so the language is part of knowing the tool. */
export const JUN_CODE_LANGUAGE = "typescript";

export interface CodeArgument {
  key: string;
  language: string;
  code: string;
}

/** The code argument of a built-in tool call, or null for every other tool. */
export function codeArgumentOf(toolName: string, input: unknown): CodeArgument | null {
  if (toolName !== JUN_CODE_TOOL_NAME) return null;
  const code = (input as { code?: unknown } | null | undefined)?.code;
  if (typeof code !== "string" || code.length === 0) return null;
  return { key: "code", language: JUN_CODE_LANGUAGE, code };
}
