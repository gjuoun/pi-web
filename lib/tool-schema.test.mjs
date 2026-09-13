import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { buildToolSchemaMap, languageTokenFromMediaType, lookupToolSchema, mergeToolSchemaCache, toolCallDisplay } = await jiti.import("./tool-schema.ts");

/** Stand-in for "the highlighter knows these", so the rule stays pure in tests. */
const known = new Set(["typescript", "python", "sh"]);
const hasLanguage = (token) => known.has(token);

const declaredSchema = {
  type: "object",
  required: ["code"],
  properties: {
    code: { type: "string", description: "TypeScript code to execute.", contentMediaType: "text/x-typescript" },
  },
};

test("renders a declared string argument as code, with the declared language", () => {
  const display = toolCallDisplay({ code: "const a = 1;\nconsole.log(a);" }, declaredSchema, hasLanguage);
  assert.deepEqual(display, {
    kind: "code",
    arguments: [{ key: "code", value: "const a = 1;\nconsole.log(a);", language: "typescript" }],
  });
});

test("leaves an undeclared tool call as JSON — no length, newline or key-name inference", () => {
  const undeclared = {
    type: "object",
    properties: { code: { type: "string", description: "just a string" } },
  };
  assert.deepEqual(toolCallDisplay({ code: "const a = 1;\nconst b = 2;" }, undeclared, hasLanguage), { kind: "json" });

  // The shape that used to be guessed: one long multi-line string, still JSON.
  assert.deepEqual(toolCallDisplay({ path: "/tmp/x.ts", content: "line\nline\nline" }, {
    type: "object",
    properties: { path: { type: "string" }, content: { type: "string" } },
  }, hasLanguage), { kind: "json" });

  // No schema at all (session not started yet / tool not exposed).
  assert.deepEqual(toolCallDisplay({ code: "x" }, undefined, hasLanguage), { kind: "json" });
  assert.deepEqual(toolCallDisplay({ code: "x" }, null, hasLanguage), { kind: "json" });
});

test("unknown media types fall back to plain text rather than a wrong language", () => {
  const schema = {
    type: "object",
    properties: { script: { type: "string", contentMediaType: "text/x-nonesuch" } },
  };
  assert.deepEqual(toolCallDisplay({ script: "print(1)" }, schema, hasLanguage), {
    kind: "code",
    arguments: [{ key: "script", value: "print(1)", language: "text" }],
  });
});

test("renders every declared argument, in schema order", () => {
  const schema = {
    type: "object",
    properties: {
      before: { type: "string", contentMediaType: "text/x-typescript" },
      count: { type: "number" },
      after: { type: "string", contentMediaType: "text/x-python" },
    },
  };
  const display = toolCallDisplay({ before: "a();", after: "b()", count: 2 }, schema, hasLanguage);
  assert.equal(display.kind, "code");
  assert.deepEqual(display.arguments.map((a) => [a.key, a.language]), [["before", "typescript"], ["after", "python"]]);
});

test("ignores declarations that are not a plain string parameter", () => {
  const bad = {
    type: "object",
    properties: {
      anyOfString: { anyOf: [{ type: "string" }], contentMediaType: "text/x-typescript" },
      notAString: { type: "number", contentMediaType: "text/x-typescript" },
      empty: { type: "string", contentMediaType: "   " },
    },
  };
  assert.deepEqual(toolCallDisplay({ anyOfString: "x", notAString: "y", empty: "z" }, bad, hasLanguage), { kind: "json" });
});

test("skips a declared argument the model did not send", () => {
  assert.deepEqual(toolCallDisplay({}, declaredSchema, hasLanguage), { kind: "json" });
});

test("remembers live schemas, so a later session still renders by declaration", () => {
  const live = buildToolSchemaMap([
    { name: "jun_code", parameters: declaredSchema },
    { name: "read" }, // no parameters reported
  ]);
  assert.deepEqual([...live.keys()], ["jun_code"]);

  const first = mergeToolSchemaCache({}, live);
  assert.equal(first.changed, true);
  assert.deepEqual(first.cache, { jun_code: declaredSchema });

  // Re-merging the same schemas changes nothing, so nothing is rewritten.
  assert.equal(mergeToolSchemaCache(first.cache, live).changed, false);

  // A session whose tool list was never loaded still finds the declaration.
  const emptyLive = new Map();
  assert.deepEqual(lookupToolSchema("jun_code", emptyLive, first.cache), declaredSchema);
  assert.equal(lookupToolSchema("mystery", emptyLive, first.cache), undefined);
});

test("the session's own schema wins over the remembered one", () => {
  const remembered = { code: { type: "string", contentMediaType: "text/x-python" } };
  const live = buildToolSchemaMap([{ name: "jun_code", parameters: declaredSchema }]);
  assert.deepEqual(lookupToolSchema("jun_code", live, { jun_code: remembered }), declaredSchema);
});

test("languageTokenFromMediaType keeps only the structural part", () => {
  assert.equal(languageTokenFromMediaType("text/x-typescript"), "typescript");
  assert.equal(languageTokenFromMediaType("application/x-sh"), "sh");
  assert.equal(languageTokenFromMediaType("text/x-python"), "python");
  assert.equal(languageTokenFromMediaType("text/rust"), "rust");
  assert.equal(languageTokenFromMediaType("image/png"), "");
  assert.equal(languageTokenFromMediaType("text/"), "");
  assert.equal(languageTokenFromMediaType(""), "");
});
