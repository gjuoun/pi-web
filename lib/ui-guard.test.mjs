import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SCOPES, checkSource } from "../scripts/ui-guard.mjs";

// Fixture class names are assembled from parts so Tailwind's source scan does not generate them.
const cls = (...parts) => parts.join("");
const rules = (src) => checkSource("components/app/x.tsx", src).map((v) => v.rule);

test("clean source using role colours and public props passes", () => {
  const src = `export const A = () => <Button variant="outline" className="bg-primary text-primary-foreground p-2 hover:bg-muted" />;`;
  assert.deepEqual(rules(src), []);
});

test("rejects the important modifier in both spellings", () => {
  assert.deepEqual(rules(`const a = "${cls("p-2", "!")} flex";`), ["important"]);
  assert.deepEqual(rules(`const a = "${cls("!", "p-2")} flex";`), ["important"]);
});

test("rejects selectors into a primitive's internal slots", () => {
  assert.deepEqual(rules(`const a = "${cls("[&_[data-slot", "=button]]:p-0")}";`), ["slot-selector"]);
  assert.deepEqual(rules(`const a = "${cls("[&>[data-slot", "=card]]:p-0")}";`), ["slot-selector"]);
});

test("rejects hard-coded colours and raw palette classes, allows role colours", () => {
  assert.deepEqual(rules(`const a = "${cls("bg-[#", "fff]")} ${cls("text-[rg", "ba(0,0,0,.5)]")}";`), ["hardcoded-colour", "hardcoded-colour"]);
  assert.deepEqual(rules(`const a = "${cls("bg-blue", "-500")} ${cls("text-", "white")} ${cls("border-", "black")}";`), ["raw-palette", "raw-palette", "raw-palette"]);
  assert.deepEqual(rules(`const a = "bg-muted text-muted-foreground border-border text-destructive";`), []);
});

test("rejects static style objects unless explicitly allowed with a reason", () => {
  assert.deepEqual(rules(`const a = <div style={{ color: "red" }} />;`), ["static-style"]);
  assert.deepEqual(rules(`const a = <div style={dynamic} />;`), []);
  assert.deepEqual(rules(`// ui-guard-allow: runtime geometry\nconst a = <div style={{ width }} />;`), []);
});

test("reports the line number of each violation", () => {
  const out = checkSource("components/app/x.tsx", `const a = 1;\nconst b = "${cls("bg-", "white")}";\n`);
  assert.equal(out.length, 1);
  assert.equal(out[0].line, 2);
  assert.equal(out[0].file, "components/app/x.tsx");
});

test("the default scopes cover the component layer and both showcase pages", () => {
  for (const scope of ["components/app", "app/ui/lib", "app/ui/preview"]) assert.ok(DEFAULT_SCOPES.includes(scope), `${scope} must be scanned`);
});
