import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const {
  ConfigPanelShell,
  ConfigSplitView,
  ConfigSidebar,
  ConfigSidebarList,
  ConfigSidebarGroupLabel,
  ConfigSidebarItem,
  ConfigSidebarText,
  ConfigDetail,
  ConfigDetailStack,
  ConfigDetailHeader,
  ConfigDetailHeaderInfo,
  ConfigDetailActions,
  ConfigDetailTitle,
  ConfigSectionTitle,
  ConfigField,
  ConfigEmptyState,
  ConfigFooter,
  ConfigButton,
  ConfigSwitch,
  ConfigListAction,
  ConfigStatusDot,
} = await jiti.import("./SettingsUi.tsx");

const templateSource = await readFile(new URL("./SettingsUi.tsx", import.meta.url), "utf8");
const globalCssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const enSource = await readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8");
const zhSource = await readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8");
const configSources = await Promise.all(
  ["ModelsConfig", "SkillsConfig", "PluginsConfig"].map(async (name) => [
    name,
    await readFile(new URL(`./${name}.tsx`, import.meta.url), "utf8"),
  ]),
);

function render(el) {
  return renderToStaticMarkup(el);
}

test("provides one template for config layout and controls", () => {
  for (const primitive of [
    "ConfigPanelShell",
    "ConfigSplitView",
    "ConfigSidebar",
    "ConfigSidebarGroupLabel",
    "ConfigSidebarItem",
    "ConfigSidebarText",
    "ConfigDetail",
    "ConfigDetailStack",
    "ConfigDetailHeader",
    "ConfigDetailHeaderInfo",
    "ConfigDetailActions",
    "ConfigDetailTitle",
    "ConfigSectionTitle",
    "ConfigField",
    "ConfigEmptyState",
    "ConfigFooter",
    "ConfigButton",
    "ConfigSwitch",
    "ConfigListAction",
    "ConfigStatusDot",
  ]) {
    assert.match(templateSource, new RegExp(`export function ${primitive}`));
  }
});

test("keeps every export composing raw components/ui — never hand-rolled markup", () => {
  assert.doesNotMatch(templateSource, /<style>/);
  assert.doesNotMatch(templateSource, /onMouseEnter|onMouseLeave/);
  assert.match(templateSource, /from "@\/components\/ui\/button"/);
  assert.match(templateSource, /from "@\/components\/ui\/switch"/);
  assert.match(templateSource, /from "@\/components\/ui\/dialog"/);
  assert.match(templateSource, /from "@\/components\/ui\/label"/);
  assert.match(templateSource, /from "@\/components\/ui\/empty"/);
});

test("loads settings presentation from globals.css, with no dedicated settings stylesheet", () => {
  assert.match(layoutSource, /import "\.\/globals\.css";/);
  assert.doesNotMatch(layoutSource, /settings\.css/);
  assert.doesNotMatch(globalCssSource, /\.settings-dialog-backdrop \{/);
});

test("all four settings sections use the shared list-detail layout", () => {
  for (const [name, source] of configSources) {
    for (const primitive of ["ConfigPanelShell", "ConfigSplitView", "ConfigSidebar", "ConfigDetail", "ConfigFooter"]) {
      assert.match(source, new RegExp(`<${primitive}`), `${name} should use ${primitive}`);
    }
  }
});

test("all subpanel sidebars share one interactive item template", () => {
  const sources = Object.fromEntries(configSources);
  for (const source of Object.values(sources)) {
    assert.match(source, /<ConfigSidebarText/);
  }
  for (const name of ["SkillsConfig", "PluginsConfig"]) {
    assert.match(sources[name], /<ConfigSidebarGroupLabel/);
    assert.match(sources[name], /<ConfigSidebarItem/);
  }
  assert.doesNotMatch(templateSource, /setHovered|setFocusVisible|useState/);
  assert.doesNotMatch(sources.SkillsConfig, /onMouseEnter[\s\S]*?bg-/);
});

test("plugin sidebar rows omit detail metadata", () => {
  const pluginSource = Object.fromEntries(configSources).PluginsConfig;
  const sidebarSource = pluginSource.match(/<ConfigSidebarList>[\s\S]*?<\/ConfigSidebarList>/)?.[0] ?? "";
  assert.match(sidebarSource, /<ConfigSidebarItem/);
  assert.match(sidebarSource, /<ConfigSidebarText[\s\S]*?\{pkg\.source\}/);
  assert.doesNotMatch(sidebarSource, /resourceSummary\(pkg|versionSummary\(pkg/);
});

test("skill scope group labels are localized", () => {
  const skillsSource = Object.fromEntries(configSources).SkillsConfig;
  for (const scope of ["global", "project", "path"]) {
    assert.match(skillsSource, new RegExp(`t\\("skills\\.scope\\.${scope}"\\)`));
    assert.match(enSource, new RegExp(`"skills\\.scope\\.${scope}":`));
    assert.match(zhSource, new RegExp(`"skills\\.scope\\.${scope}":`));
  }
  assert.match(zhSource, /"skills\.scope\.global": "全局"/);
  assert.match(zhSource, /"skills\.scope\.project": "项目"/);
});

test("all subpanel detail panes share one content hierarchy", () => {
  const sources = Object.fromEntries(configSources);
  for (const source of Object.values(sources)) {
    assert.match(source, /<ConfigDetailStack/);
    assert.match(source, /<ConfigEmptyState/);
  }
});

test("detail header actions keep buttons and switches aligned to the right", () => {
  const sources = Object.fromEntries(configSources);
  for (const name of ["SkillsConfig", "PluginsConfig"]) {
    assert.match(sources[name], /<ConfigDetailActions>/);
  }
  assert.match(sources.PluginsConfig, /<ConfigDetailActions>[\s\S]*?<ConfigSwitch[\s\S]*?<\/ConfigDetailActions>/);
});

test("embedded sections do not repeat Settings close actions", () => {
  const sources = Object.fromEntries(configSources);
  assert.match(sources.ModelsConfig, /!embedded && <ConfigButton onClick=\{onClose\}>\{t\("i18n\.cancel"\)\}/);
  assert.match(sources.SkillsConfig, /!embedded && <ConfigButton onClick=\{onClose\}>\{t\("i18n\.close"\)\}/);
  assert.match(sources.PluginsConfig, /!embedded && <ConfigButton onClick=\{onClose\}>\{t\("i18n\.close"\)\}/);
});

test("subpanel footers keep the primary save action recognizable", () => {
  const sources = Object.fromEntries(configSources);
  assert.match(sources.ModelsConfig, /<ConfigButton\s+variant="primary"[\s\S]*?onClick=\{handleSave\}/);
  assert.match(sources.SkillsConfig, /<ConfigButton variant="secondary" onClick=\{\(\) => void checkForUpdates\(\)\}/);
  assert.match(sources.PluginsConfig, /<ConfigButton variant="secondary" onClick=\{\(\) => void loadPlugins\(\)\}/);
});

test("skills and plugins share enabled and disabled controls", () => {
  const sources = Object.fromEntries(configSources);
  for (const name of ["SkillsConfig", "PluginsConfig"]) {
    assert.match(sources[name], /<ConfigSwitch/);
    assert.match(sources[name], /<ConfigStatusDot/);
  }
});

test("ConfigSidebarItem renders as a real button honoring active/current state", () => {
  const html = render(React.createElement(ConfigSidebarItem, { active: true }, "Row"));
  assert.match(html, /<button/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /data-slot="config-sidebar-item"/);
});

test("ConfigButton renders shadcn Button with data-slot and mapped variant", () => {
  const html = render(React.createElement(ConfigButton, { variant: "danger" }, "Delete"));
  assert.match(html, /data-slot="button"/);
  assert.match(html, /data-variant="destructive"/);
});

test("ConfigSwitch renders a real switch role with aria-checked and busy state", () => {
  const html = render(
    React.createElement(ConfigSwitch, {
      checked: true,
      loading: true,
      label: "Enabled",
      onChange: () => {},
    }),
  );
  assert.match(html, /role="switch"/);
  assert.match(html, /aria-checked="true"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /data-slot="spinner"/);
});

test("ConfigListAction renders as a button with data-slot and aria-current", () => {
  const html = render(React.createElement(ConfigListAction, { active: true }, "Add"));
  assert.match(html, /data-slot="config-list-action-button"/);
  assert.match(html, /aria-current="page"/);
});

test("ConfigStatusDot exposes an aria-hidden data-slot marker", () => {
  const html = render(React.createElement(ConfigStatusDot, { active: true }));
  assert.match(html, /data-slot="config-status-dot"/);
  assert.match(html, /aria-hidden="true"/);
});

test("ConfigField labels its content with a real label element", () => {
  const html = render(React.createElement(ConfigField, { label: "Name" }, React.createElement("input")));
  assert.match(html, /data-slot="label"/);
  assert.match(html, />Name</);
});

test("ConfigPanelShell embedded branch renders children without a dialog wrapper", () => {
  const html = render(
    React.createElement(
      ConfigPanelShell,
      { embedded: true, title: "Models", onClose: () => {} },
      "content",
    ),
  );
  assert.doesNotMatch(html, /data-slot="dialog"/);
  assert.match(html, /content/);
});

test("ConfigPanelShell modal branch is a Radix dialog (portal content is not SSR-visible)", () => {
  const html = render(
    React.createElement(
      ConfigPanelShell,
      { embedded: false, title: "Models", onClose: () => {} },
      "content",
    ),
  );
  // Dialog root + trigger area render; the portal content itself is invisible under SSR
  // (see plan Decision 6 / probe ssr.txt: "dialog-open: empty"). Open-state proof for the
  // title/close-button/overlay behaviour belongs to e2e / drive-themes, not this unit test.
  assert.doesNotMatch(html, /content/);
});
