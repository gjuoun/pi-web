import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  isUtilityFontFamily,
  parseAtsutilFamilies,
  parseFontconfigList,
  parseWindowsFamilies,
  toInstalledFonts,
  pickerFamilies,
  mergeMonospace,
  probeMonospaceFamilies,
} = await jiti.import("./fonts-installed.ts");

const ATSUTIL = [
  "System Fonts:",
  "\tAcademyEngravedLetPlain",
  "\tAlBayan",
  "\t.SFNSMono",
  "User Fonts:",
  "\tJetBrainsMono-Regular",
  "System Families:",
  "\tAcademy Engraved LET",
  "\tAl Bayan",
  "\tMaple Mono",
  "User Families:",
  "\tJetBrains Mono",
  "",
].join("\n");

test("the atsutil parser reads family sections and ignores face sections", () => {
  assert.deepEqual(parseAtsutilFamilies(ATSUTIL), ["Academy Engraved LET", "Al Bayan", "Maple Mono", "JetBrains Mono"]);
  assert.deepEqual(parseAtsutilFamilies(""), []);
  assert.deepEqual(parseAtsutilFamilies("No colon section here\n\tignored"), []);
});

test("the fontconfig parser maps spacing codes to the mono flag", () => {
  const parsed = parseFontconfigList("JetBrains Mono\t100\nInter\t\nApple Braille\t90\nCourier New\t110\n\nBroken\n");
  assert.deepEqual(parsed, [
    { family: "JetBrains Mono", mono: true },
    { family: "Inter", mono: false },
    { family: "Apple Braille", mono: false },
    { family: "Courier New", mono: true },
  ]);
});

test("the Windows parser returns families with no classification", () => {
  assert.deepEqual(parseWindowsFamilies("Arial\r\nConsolas\r\n\r\n"), [
    { family: "Arial", mono: false },
    { family: "Consolas", mono: false },
  ]);
});

test("internal, emoji and icon families are filtered out", () => {
  for (const junk of [".SF NS Mono", "$Hidden", "Apple Color Emoji", "Material Icons", "Marlett", "LastResort", "  "]) {
    assert.equal(isUtilityFontFamily(junk), true, `${junk} should be treated as utility`);
  }
  for (const real of ["Menlo", "Inter", "PingFang SC", "Noto Sans CJK SC", "Songti SC"]) {
    assert.equal(isUtilityFontFamily(real), false, `${real} should be kept`);
  }
});

test("duplicates collapse case-insensitively and are sorted for the picker", () => {
  const fonts = toInstalledFonts([
    { family: "Zapfino" },
    { family: "Inter" },
    { family: " Menlo " },
    { family: "Menlo", mono: true },
    { family: "Apple Color Emoji" },
    { family: "" },
    { family: "menlo" },
  ]);
  assert.deepEqual(fonts, [
    { family: "Inter", mono: false },
    { family: "Menlo", mono: true },
    { family: "Zapfino", mono: false },
  ]);
});

test("each role is offered only its own kind of font", () => {
  const fonts = [
    { family: "Inter", mono: false },
    { family: "Menlo", mono: true },
    { family: "Unclassified", mono: false },
  ];
  assert.deepEqual(pickerFamilies(fonts, "ui"), ["Inter", "Unclassified"]);
  assert.deepEqual(pickerFamilies(fonts, "mono"), ["Menlo"]);
});

test("the browser probe adds mono hits without removing the OS classification", () => {
  const fonts = [
    { family: "Menlo", mono: true },
    { family: "Consolas", mono: false },
    { family: "Inter", mono: false },
  ];
  assert.deepEqual(mergeMonospace(fonts, ["Consolas", "Inter"]), [
    { family: "Menlo", mono: true },
    { family: "Consolas", mono: true },
    { family: "Inter", mono: true },
  ]);
  assert.deepEqual(mergeMonospace(fonts, []), fonts);
});

test("the browser probe is a no-op without a document", () => {
  assert.deepEqual(probeMonospaceFamilies(["Menlo", "Inter"]), []);
});
