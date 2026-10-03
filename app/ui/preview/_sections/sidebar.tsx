import { AgentGlyph, ArchiveGlyph, ChangesGlyph, ExplorerChevron, GroupChevron, PinGlyph, PlusGlyph, RefreshGlyph, RunningArc, SearchGlyph, SettingsGlyph, TerminalGlyph, TreeChevron, UploadGlyph, WorktreeGlyph } from "@/components/app/glyphs";
import { AppSidebar } from "@/components/app/sidebar/app-sidebar";
import { ExplorerPanel } from "@/components/app/sidebar/explorer-panel";
import { ProjectGroup } from "@/components/app/sidebar/project-group";
import { SessionRow } from "@/components/app/sidebar/session-row";
import { Specimen } from "@/app/ui/lib/_showcase/specimen";
import { Frame } from "../_showcase/frame";
import { explorerRows } from "../_fixtures/explorer";
import { projects } from "../_fixtures/sessions";

const collapsed = projects.map((project) => ({ ...project, expanded: false }));

export function SidebarRegion() {
  return (
    <>
      <Specimen name="app-app-sidebar" title="AppSidebar" source="components/app/sidebar/app-sidebar.tsx" variants={["expanded group", "all collapsed"]}>
        <div className="flex flex-wrap items-start gap-6">
          <Frame name="sidebar-default" size="column"><AppSidebar projects={projects} explorerRows={explorerRows} /></Frame>
          <Frame name="sidebar-collapsed" size="column"><AppSidebar projects={collapsed} explorerRows={explorerRows} /></Frame>
        </div>
      </Specimen>
      <Specimen name="app-session-row" title="SessionRow" source="components/app/sidebar/session-row.tsx" variants={["default", "active", "pinned", "running", "subagent child"]}>
        <div className="flex w-[260px] flex-col border border-border bg-sidebar">
          <SessionRow id="a" title="Plain session" time="2h" />
          <SessionRow id="b" title="Active session" time="now" active />
          <SessionRow id="c" title="Pinned session" time="3h" pinned />
          <SessionRow id="d" title="Running session" time="1d" running />
          <SessionRow id="e" title="worker#267a2e52" time="1d" depth={1} />
        </div>
      </Specimen>
      <Specimen name="app-project-group" title="ProjectGroup" source="components/app/sidebar/project-group.tsx" variants={["expanded", "collapsed"]}>
        <div className="flex w-[260px] flex-col border border-border bg-sidebar">
          <ProjectGroup {...projects[0]} expanded />
          <ProjectGroup {...projects[1]} expanded={false} />
        </div>
      </Specimen>
      <Specimen name="app-explorer-panel" title="ExplorerPanel" source="components/app/sidebar/explorer-panel.tsx" variants={["modified", "untracked", "folders and files"]}>
        <div className="w-[260px] border border-border bg-sidebar">
          <ExplorerPanel rows={explorerRows} />
        </div>
      </Specimen>
      <Specimen name="app-glyphs" title="Glyphs" source="components/app/glyphs.tsx" variants={["ported from the real sidebar and explorer"]}>
        <div className="flex flex-wrap items-center gap-4 text-foreground">
          <PlusGlyph /><SearchGlyph /><ArchiveGlyph /><GroupChevron collapsed={false} /><GroupChevron collapsed /><WorktreeGlyph /><PinGlyph /><AgentGlyph /><RunningArc />
          <ExplorerChevron open /><TreeChevron /><TerminalGlyph /><ChangesGlyph /><UploadGlyph /><RefreshGlyph /><SettingsGlyph />
        </div>
      </Specimen>
    </>
  );
}
