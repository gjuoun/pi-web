import type { ProjectItem } from "@/components/app/view-types";

/**
 * Six projects, 14 session rows, the same shape as the real sidebar: one expanded group, header counts equal
 * to the sessions in the group (the real sidebar counts families). No row is `running`: that state comes from a
 * live agent, which the seeded real app cannot have, so it is shown only on the SessionRow specimen. Subagent
 * children are not rows either: the real list shows only a family's root.
 */
export const projects: ProjectItem[] = [
  {
    name: "pi-web",
    count: 4,
    expanded: true,
    sessions: [
      { id: "s-ui-lib", title: "🎨Draft pi-web UI component library page", time: "now", active: true, pinned: true },
      { id: "s-triage", title: "🧭Orchestrator: pi-web issue triage and UI follow-ups", time: "3h", pinned: true },
      { id: "s-cmd-issue", title: "- Start by loading the skill `cmd/issue` to understand the issue process", time: "5h" },
      { id: "s-subagents", title: "let's test each subagent, just make sure they can edit and read", time: "1d" },
    ],
  },
  { name: "notebook", count: 2, sessions: [{ id: "n-1", title: "Weekly review notes", time: "2d" }, { id: "n-2", title: "Move the kanban boards under project folders", time: "3d" }] },
  { name: "universal-api", count: 1, sessions: [{ id: "u-1", title: "Add idempotency keys to the payout endpoint", time: "4d" }] },
  { name: "goat-the-dashboard", count: 1, sessions: [{ id: "g-1", title: "Dark mode as a variant for every theme", time: "6d" }] },
  { name: "jun", count: 2, sessions: [{ id: "j-1", title: "Plan the move to the new laptop", time: "1w" }, { id: "j-2", title: "Set up the 1Password service account", time: "1w" }] },
  { name: "jun-agent", count: 1, sessions: [{ id: "a-1", title: "Roster change: remove apply_patch", time: "1w" }] },
];
