import type { PluginItem, ProviderItem, SkillItem } from "@/components/app/view-types";

/**
 * The home directory the parity harness seeds. Settings screens show absolute paths (a plugin's install path,
 * a skill's file), so the seeded real app lives at a fixed location and the fixtures carry the same literal
 * paths. It is the real path of `/tmp` on macOS; `e2e/parity/server.mjs` refuses to run where it is not.
 */
export const SEEDED_ROOT = "/private/tmp/pi-parity";
export const SEEDED_HOME = `${SEEDED_ROOT}/home`;

export const providers: ProviderItem[] = [{ id: "anthropic", name: "Anthropic" }];

const skillPath = (name: string) => `${SEEDED_HOME}/.pi/agent/skills/${name}/SKILL.md`;

/** In the real list's order (by name). The directory name is the skill name. */
export const skills: SkillItem[] = [
  { name: "cmd-issue", description: "Read, create, or update project issues on the markdown kanban boards.", enabled: true },
  { name: "config-create-pull-request", description: "Open a pull request with the repository's template and checks.", enabled: true },
  { name: "jun-build", description: "Execute a plan step by step, proving each step as it lands.", enabled: true },
  { name: "jun-plan", description: "Write an implementation plan where every step carries its own verification.", enabled: true },
  { name: "super-handover", description: "Write a handover note so a new session can pick up the work.", enabled: true },
].map((skill) => ({ ...skill, path: skillPath(skill.name) }));

const pluginPath = (name: string) => `${SEEDED_HOME}/.pi/agent/plugins/${name}`;

/** Local packages (an `npm:` source would make pi install it over the network). Printed by path, as the real list does. */
export const plugins: PluginItem[] = [
  { name: "pi-subagents", version: "1.4.2", enabled: true, status: "loaded", resources: "1 ext", scope: "global" },
  { name: "pi-notify", version: "0.3.0", enabled: true, status: "loaded", resources: "1 ext", scope: "global" },
  { name: "pi-web-ext", version: "0.1.0", enabled: false, status: "disabled", resources: "disabled", scope: "global" },
].map((plugin) => ({ ...plugin, path: pluginPath(plugin.name) } as PluginItem));

export const pluginsCwd = `${SEEDED_HOME}/code/gjuoun/pi-web`;
export const pluginsSummary = "2 ext · 0 skills · 0 prompts · 0 themes";

export const generalSettings = {
  uiFont: "System default",
  monoFont: "System default",
  thinkingExpanded: false,
  contentWidth: 820,
  contentWidthRange: [820, 2000] as const,
  fontSize: 14,
  fontSizeRange: [12, 24] as const,
  quoteSelection: false,
  completionSound: true,
  pushDescription:
    "After adding this site to your home screen (iOS 16.4+), a system notification is shown on the lock screen when a session finishes while no window is visible. If notifications stop arriving, re-register here. Registration needs a user gesture, so it is never triggered automatically.",
  languages: [
    { name: "English", code: "en" },
    { name: "简体中文", code: "zh-CN" },
    { name: "繁體中文", code: "zh-TW" },
  ],
  language: "English",
};
