import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelSource = await readFile(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");
const shellSource = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const sidebarSource = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const themeSource = await readFile(new URL("../hooks/useTheme.ts", import.meta.url), "utf8");
const themeOptionsSource = await readFile(new URL("../lib/theme.ts", import.meta.url), "utf8");
const enSource = await readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8");
const zhSource = await readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8");
const loginSource = await readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8");

test("opens one settings panel from the single sidebar shortcut", () => {
  assert.match(shellSource, /<SettingsPanel/);
  assert.match(shellSource, /initialSection=\{settingsSection\}/);
  assert.match(shellSource, /translate\("common\.settings"\)/);
  assert.match(shellSource, /<SettingsSectionIcon section="general" size=\{14\} strokeWidth=\{2\} \/>\s*<span>\{translate\("common\.settings"\)\}<\/span>/);
  assert.doesNotMatch(shellSource, /\["plugins", translate\("common\.plugins"\)\]/);
  assert.doesNotMatch(shellSource, /\["models", translate\("common\.models"\)\]/);
  assert.doesNotMatch(shellSource, /\["skills", translate\("common\.skills"\)\]/);
  assert.doesNotMatch(shellSource, /setSettingsSection\(section\)/);
  assert.doesNotMatch(shellSource, /setModelsConfigOpen|setSkillsConfigOpen|setAgentsConfigOpen|setPluginsConfigOpen/);
});

test("keeps every requested configuration surface inside the settings panel", () => {
  for (const section of ["general", "models", "skills", "plugins"]) {
    assert.match(panelSource, new RegExp(`id: "${section}"`));
  }
  // Sub-agents are configured on the machine (~/.pi/agent/subagents.json + profile .md files),
  // never in this UI — docs/adr/0006.
  assert.doesNotMatch(panelSource, /id: "agents"/);
  assert.doesNotMatch(panelSource, /AgentsConfig/);
  for (const component of ["ModelsConfig", "SkillsConfig", "PluginsConfig"]) {
    assert.match(panelSource, new RegExp(`<${component} embedded`));
  }
});

test("restores the settings section and each list detail selection", async () => {
  assert.match(shellSource, /getLastSettingsSection\(projectTrustCwd\)/);
  assert.match(panelSource, /setLastSettingsSection\(initialSection\)/);
  assert.match(panelSource, /setLastSettingsSection\(nextSection\)/);
  for (const name of ["ModelsConfig", "SkillsConfig", "PluginsConfig"]) {
    assert.match(
      await readFile(new URL(`./${name}.tsx`, import.meta.url), "utf8"),
      /getLastSettingsSelection/,
    );
  }
});

test("keeps visited settings sections mounted and contains nested Escape handling", async () => {
  const modelsSource = await readFile(new URL("./ModelsConfig.tsx", import.meta.url), "utf8");
  assert.match(panelSource, /mountedSections\.has\(id\)/);
  assert.match(panelSource, /hidden=\{section !== id\}/);
  assert.match(panelSource, /event\.defaultPrevented/);
  assert.match(modelsSource, /e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*onClose\(\);/);
});

test("offers light/dark/auto theme selection with a shadcn radio group", () => {
  for (const preference of ["light", "dark", "auto"]) {
    assert.match(themeOptionsSource, new RegExp(`id: "${preference}"`));
  }
  for (const removed of ['mist', 'rose', 'pine']) {
    assert.doesNotMatch(themeOptionsSource, new RegExp(`id: "${removed}"`));
  }
  assert.match(panelSource, /THEME_OPTIONS\.map/);
  assert.match(panelSource, /<RadioGroup/);
  assert.match(panelSource, /<RadioGroupItem value=\{option\.id\}/);
  assert.match(panelSource, /onValueChange=\{\(value\) => setThemePreference/);
  assert.doesNotMatch(panelSource, /type="radio"/);
  assert.match(themeSource, /const setThemePreference = useCallback/);
});

test("keeps language selection in General settings", () => {
  assert.match(panelSource, /t\("common\.language"\)/);
  assert.match(panelSource, /data-slot="settings-language-options"/);
  assert.match(panelSource, /setLocale\(plugin\.id/);
});

test("groups chat display controls together without row backgrounds", () => {
  const appearanceSection = panelSource.slice(
    panelSource.indexOf('{t("settings.appearance")}'),
    panelSource.indexOf('{t("settings.chat")}'),
  );
  const chatSection = panelSource.slice(
    panelSource.indexOf('{t("settings.chat")}'),
    panelSource.indexOf("{shellSettings?.isWindows"),
  );

  assert.doesNotMatch(appearanceSection, /settings-chat-content/);
  assert.equal((chatSection.match(/<ConfigSwitch/g) ?? []).length, 3);
  for (const key of ["thinkingExpandedDefault", "messageWidth", "chatContentFontSize", "quoteSelection", "completionSound"]) {
    assert.match(chatSection, new RegExp(`t\\("settings\\.${key}"\\)`));
  }
  assert.doesNotMatch(panelSource, /ThinkingIcon|settings-thinking-/);
  assert.doesNotMatch(chatSection, /className="[^"]*bg-/);
});

test("keeps General free of divider rows", () => {
  assert.match(panelSource, /border-b border-border/);
  assert.doesNotMatch(panelSource, /sections\.find\(\(item\) => item\.id === section\)/);
  assert.doesNotMatch(panelSource, /<section style=\{\{[^}]*borderBottom/);
  assert.doesNotMatch(panelSource, /borderLeft: index > 0/);
});

test("uses top navigation on desktop and one compact section picker on mobile", () => {
  assert.match(panelSource, /<NativeSelect/);
  assert.match(panelSource, /max-\[640px\]:block/);
  assert.match(panelSource, /max-\[640px\]:hidden/);
  assert.match(panelSource, /data-slot="settings-section-tab"/);
  assert.doesNotMatch(panelSource, /width: isMobile \? "100%" : 188/);
  assert.match(panelSource, /<main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">/);
  assert.doesNotMatch(panelSource, /<style>/);
  assert.doesNotMatch(panelSource, /style=\{\{/);
});

test("drops every sub-agent configuration message with the panel", () => {
  for (const source of [enSource, zhSource]) {
    assert.doesNotMatch(source, /"common\.agents":/);
    assert.doesNotMatch(source, /"agents\./);
  }
});

test("keeps the child-session robot glyph for the sidebar's sub-agent rows", () => {
  const robotGlyph = /<rect x="5" y="7" width="14" height="11" rx="2" \/>\s*<path d="M9 11h\.01M15 11h\.01M9 15h6M12 7V4M10 4h4" \/>/;
  assert.match(sidebarSource, robotGlyph);
  assert.doesNotMatch(panelSource, /is-agent/);
});

test("uses the compact controls glyph for General", () => {
  assert.match(panelSource, /section === "general"[\s\S]*?<path d="M20 7h-9M14 17H5" \/>[\s\S]*?<circle cx="7" cy="7" r="3" \/>[\s\S]*?<circle cx="17" cy="17" r="3" \/>/);
});

test("keeps password authentication to one login field and one settings action", () => {
  assert.equal((loginSource.match(/type="password"/g) ?? []).length, 1);
  assert.doesNotMatch(loginSource, /type="(?:text|email)"/);
  assert.match(loginSource, /autoComplete="current-password"/);
  assert.match(loginSource, /!destination\.startsWith\("\/\/"\)/);
  assert.match(panelSource, /fetch\("\/api\/web-auth", \{ method: "DELETE" \}\)/);
  assert.match(panelSource, /t\("auth\.logOut"\)/);
  assert.match(loginSource, /rounded-\[14px\][\s\S]*?type="password"[\s\S]*?<Button type="submit"/);
});
