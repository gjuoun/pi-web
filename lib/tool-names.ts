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
 * This fork's own code-mode tool.
 *
 * Treated the way the host treats its own inline tools — the chat view knows it
 * by name (`pi-web-subagent` is handled the same way for subagent cards in
 * `MessageView`). Its `code` argument IS TypeScript source, so an expanded call
 * renders as a code block instead of as argument JSON.
 *
 * No schema lookup, no media-type parsing, nothing inferred from the value.
 */
export function isJunCodeToolName(toolName: string): boolean {
  return toolName === "jun_code";
}
