import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { SettingsDialogView } = await jiti.import("./settings-dialog-view.tsx");
const { SettingsGeneralView } = await jiti.import("./settings-general-view.tsx");
const { SettingsModelsView } = await jiti.import("./settings-models-view.tsx");
const { SettingsSkillsView } = await jiti.import("./settings-skills-view.tsx");
const { SettingsPluginsView } = await jiti.import("./settings-plugins-view.tsx");
const { providers, skills, plugins, generalSettings } = await jiti.import("../../../app/ui/preview/_fixtures/settings.ts");

const render = (el) => renderToStaticMarkup(el);
const count = (html, re) => (html.match(re) ?? []).length;

test("the dialog frame shows the title, four tabs with exactly one selected, and the body", () => {
  const html = render(React.createElement(SettingsDialogView, { section: "models" }, React.createElement("div", { "data-testid": "body" }, "body")));
  assert.match(html, /data-slot="settings-dialog-view"/);
  assert.match(html, />Settings</);
  for (const label of ["General", "Models", "Skills", "Plugins"]) assert.match(html, new RegExp(`>${label}<`));
  assert.equal(count(html, /data-slot="settings-tab"/g), 4);
  assert.equal(count(html, /aria-current="page"/g), 1);
  assert.match(html.match(/<div[^>]*aria-current="page"[^>]*>/)[0], /data-tab="models"/);
  assert.match(html, /data-testid="body"/);
});

test("general shows the Appearance radios once per theme, each checked on its own theme, and no text fields", () => {
  const html = render(React.createElement(SettingsGeneralView, { settings: generalSettings }));
  assert.match(html, /data-slot="settings-general-view"/);
  assert.match(html, />Appearance</);
  assert.equal(count(html, /data-appearance-for=/g), 2);
  assert.equal(count(html, /role="radio"[^>]*data-slot="radio-group-item"|data-slot="radio-group-item"[^>]*role="radio"/g), 4, "two radios in each of the two groups");
  const darkGroup = html.match(/data-appearance-for="broismypro"[\s\S]*?(?=<p class="m-0 mb-3)/)[0];
  assert.match(darkGroup, /aria-checked="true"[^>]*value="broismypro"|value="broismypro"[^>]*aria-checked="true"/);
  for (const label of ["Interface font", "Monospace font", "Message width", "Chat font size", "Language"]) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /<textarea|<select/i);
  assert.equal(count(html, /<input(?![^>]*aria-hidden)/g), 2, "only the two non-interactive range sliders (Radix adds hidden form inputs)");
});

test("models, skills and plugins render one sidebar item per fixture entry on the shared kit", () => {
  const models = render(React.createElement(SettingsModelsView, { providers }));
  assert.equal(count(models, /data-slot="config-sidebar-item"/g), providers.length);
  assert.match(models, new RegExp(providers[0].name));
  const skillsHtml = render(React.createElement(SettingsSkillsView, { skills }));
  assert.equal(count(skillsHtml, /data-slot="config-sidebar-item"/g), skills.length);
  assert.match(skillsHtml, new RegExp(skills[0].name));
  const pluginsHtml = render(React.createElement(SettingsPluginsView, { plugins, cwd: "/cwd", summary: "2 ext" }));
  assert.equal(count(pluginsHtml, /data-slot="config-sidebar-item"/g), plugins.length);
  assert.match(pluginsHtml, new RegExp(plugins[0].version.replace(/\./g, "\\.")));
});

test("the list views carry no handlers and no text fields", () => {
  for (const html of [
    render(React.createElement(SettingsModelsView, { providers })),
    render(React.createElement(SettingsSkillsView, { skills })),
    render(React.createElement(SettingsPluginsView, { plugins, cwd: "/cwd", summary: "2 ext" })),
  ]) {
    assert.doesNotMatch(html, /onclick|<input(?![^>]*aria-hidden)|<textarea/i);
  }
});
