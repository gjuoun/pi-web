import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const hook = await readFile(new URL("./useInstalledFonts.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/fonts/route.ts", import.meta.url), "utf8");
const installed = await readFile(new URL("../lib/fonts-installed.ts", import.meta.url), "utf8");

test("the store fetches the server's enumeration once per page", () => {
  assert.match(hook, /fetch\("\/api\/fonts"/);
  assert.match(hook, /if \(inFlight\) return inFlight/);
  assert.match(hook, /if \(state\.status !== "idle"\) return Promise\.resolve\(\)/);
  assert.match(hook, /useSyncExternalStore/);
});

test("the store refines classification in the browser and never removes an OS verdict", () => {
  assert.match(hook, /probeMonospaceFamilies\(fonts\.filter\(\(font\) => !font\.mono\)/);
  assert.match(hook, /mergeMonospace\(fonts, probed\)/);
  assert.match(installed, /font\.mono \|\| probedFamilies\.has\(font\.family\)/);
});

test("a failed or empty enumeration degrades to the presets instead of erroring", () => {
  assert.match(hook, /catch \{[\s\S]{0,200}status: "failed"/);
  assert.match(hook, /fonts: \[\]/);
  assert.match(hook, /source: "unavailable"/);
});

test("the route guards the request and never runs a shell string", () => {
  assert.match(route, /isApiRequestAllowed\(request\)/);
  assert.match(route, /execFile/);
  assert.doesNotMatch(route, /exec\(/, "a shell string would be an injection surface");
  assert.match(route, /"\/usr\/bin\/atsutil", \["fonts", "-list"\]/);
  assert.match(route, /"--format=%\{family\[0\]\}\\t%\{spacing\}\\n"/);
  assert.match(route, /\[Windows\.Media\.Fonts\]::SystemFontFamilies/);
  assert.match(route, /CACHE_TTL_MS/);
});

test("the route returns only family names, never paths or raw output", () => {
  const responseShape = /NextResponse\.json\(\s*\{ fonts: cache\.fonts, source: cache\.source \}/;
  assert.match(route, responseShape);
  assert.doesNotMatch(route, /postscriptName|postScript|\.path\b/);
  assert.match(route, /Cache-Control": "private, max-age=300"/);
});

test("the route falls back per platform instead of failing the page", () => {
  assert.match(route, /process\.platform === "darwin"/);
  assert.match(route, /process\.platform === "linux"/);
  assert.match(route, /process\.platform === "win32"/);
  assert.match(route, /catch\(\(\) => null\)/);
  assert.match(route, /\?\? "unavailable"/);
});
