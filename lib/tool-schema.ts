/**
 * Tool-call display, decided by the tool's OWN schema.
 *
 * A tool argument is rendered as code only when the argument **declares itself
 * as content**: JSON Schema's `contentMediaType` keyword ("this string is
 * content of this media type"). Nothing here infers anything from the value —
 * no length, no newline, no key-name list, no tool-name table. A parameter that
 * does not declare a media type is not special, and the call renders as its
 * argument JSON, exactly as before.
 *
 * The declaration travels: an extension registers `parameters` with the key
 * (`pi.registerTool({ parameters })`), pi exposes those schemas verbatim through
 * `get_tools`, and the web client receives them as `ToolEntry.parameters`
 * unchanged — verified end to end against a live session.
 */

export interface CodeArgument {
  key: string;
  value: string;
  /** Highlighter language. Always a language the highlighter actually has, or "text". */
  language: string;
}

export type ToolCallDisplay =
  | { kind: "code"; arguments: CodeArgument[] }
  | { kind: "json" };

/** True when the schema property is a string that declares a content media type. */
function contentMediaTypeOf(property: unknown): string | null {
  if (typeof property !== "object" || property === null) return null;
  const schema = property as Record<string, unknown>;
  const mediaType = schema.contentMediaType;
  if (typeof mediaType !== "string" || mediaType.trim() === "") return null;
  // `{ anyOf: [{ type: "string", contentMediaType }] }` is a string too, but only
  // a direct `type: "string"` is unambiguous — anything else is not declared.
  if (schema.type !== "string") return null;
  return mediaType.trim();
}

/**
 * `text/x-typescript` → `typescript`, `application/x-sh` → `sh`.
 *
 * Only the structural part of the media type is stripped (top-level type, and
 * the `x-`/`vnd.` vendor prefixes). Whether the highlighter knows the token is
 * decided by the caller — an unknown token means plain text, never a guess.
 */
export function languageTokenFromMediaType(mediaType: string): string {
  const [type, subtype = ""] = mediaType.split("/", 2);
  if (!subtype) return "";
  const tail = subtype.includes("+") ? subtype.split("+", 2)[1] : subtype;
  const token = tail
    .toLowerCase()
    .replace(/^(x-|vnd\.)/, "")
    .replace(/[^a-z0-9+#-]/g, "");
  return type.toLowerCase() === "text" || type.toLowerCase() === "application" ? token : "";
}

/**
 * `parameters` per tool name, from the session's `get_tools` report.
 */
export function buildToolSchemaMap(tools: readonly { name: string; parameters?: unknown }[] | null | undefined): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const tool of tools ?? []) {
    if (tool.parameters && typeof tool.parameters === "object") {
      map.set(tool.name, tool.parameters as Record<string, unknown>);
    }
  }
  return map;
}

/** Tool name → schema, as remembered from earlier sessions. */
export type ToolSchemaCache = Record<string, Record<string, unknown>>;

/**
 * Fold the live schemas into the remembered ones.
 *
 * Remembering matters because the session's tool list only arrives when
 * something asks for it: a tool call read in a later (or idle) session still
 * renders the way its tool declared, instead of degrading to JSON. Only real
 * declarations are ever stored — nothing is inferred.
 */
export function mergeToolSchemaCache(
  cache: ToolSchemaCache,
  live: ReadonlyMap<string, Record<string, unknown>>,
): { cache: ToolSchemaCache; changed: boolean } {
  let changed = false;
  const next: ToolSchemaCache = { ...cache };
  for (const [name, schema] of live) {
    if (JSON.stringify(next[name]) === JSON.stringify(schema)) continue;
    next[name] = schema;
    changed = true;
  }
  return { cache: next, changed };
}

/** Live schema first, remembered schema second, otherwise undeclared. */
export function lookupToolSchema(
  toolName: string,
  live: ReadonlyMap<string, Record<string, unknown>>,
  cache: ToolSchemaCache,
): Record<string, unknown> | undefined {
  return live.get(toolName) ?? cache[toolName];
}

/**
 * Which argument(s) to show as code, in schema declaration order.
 *
 * `parameters` is the tool's JSON Schema; `input` is this call's arguments.
 * `hasLanguage` answers "does the highlighter know this token" — injected so the
 * rule stays pure and testable.
 */
export function toolCallDisplay(
  input: unknown,
  parameters: unknown,
  hasLanguage: (token: string) => boolean = () => false,
): ToolCallDisplay {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { kind: "json" };
  if (typeof parameters !== "object" || parameters === null) return { kind: "json" };

  const properties = (parameters as Record<string, unknown>).properties;
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    return { kind: "json" };
  }

  const args: CodeArgument[] = [];
  for (const [key, property] of Object.entries(properties as Record<string, unknown>)) {
    const mediaType = contentMediaTypeOf(property);
    if (!mediaType) continue;
    const value = (input as Record<string, unknown>)[key];
    if (typeof value !== "string") continue;
    const token = languageTokenFromMediaType(mediaType);
    args.push({ key, value, language: token && hasLanguage(token) ? token : "text" });
  }

  return args.length > 0 ? { kind: "code", arguments: args } : { kind: "json" };
}
