import { Wrench } from "lucide-react";
import { FileTabs } from "@/components/app/topbar/file-tabs";
import { SessionStats } from "@/components/app/topbar/session-stats";
import { ToolbarAction } from "@/components/app/topbar/toolbar-action";
import { TopBar } from "@/components/app/topbar/top-bar";
import { Specimen } from "@/app/ui/lib/_showcase/specimen";
import { Frame } from "../_showcase/frame";
import { sessionStats } from "../_fixtures/conversation";

const tabs = [
  { id: "agents", label: "AGENTS.md", kind: "file" },
  { id: "globals", label: "globals.css", kind: "file" },
  { id: "page", label: "page.tsx", kind: "file" },
  { id: "zsh", label: "zsh", kind: "terminal" },
] as const;

export function TopbarRegion() {
  return (
    <>
      <Specimen name="app-top-bar" title="TopBar" source="components/app/topbar/top-bar.tsx" variants={["session", "new session (actions disabled)"]}>
        <div className="flex w-full flex-col gap-4">
          <Frame name="topbar-session" size="region"><div className="flex w-full flex-col"><TopBar stats={sessionStats} /></div></Frame>
          <Frame name="topbar-new" size="region"><div className="flex w-full flex-col"><TopBar fresh /></div></Frame>
        </div>
      </Specimen>
      <Specimen name="app-file-tabs" title="FileTabs" source="components/app/topbar/file-tabs.tsx" variants={["active tab", "terminal tab"]}>
        <Frame name="topbar-tabs" size="region"><div className="flex w-full flex-col"><FileTabs tabs={[...tabs]} activeId="globals" /></div></Frame>
      </Specimen>
      <Specimen name="app-toolbar-action" title="ToolbarAction" source="components/app/topbar/toolbar-action.tsx" variants={["enabled", "disabled"]}>
        <div className="flex h-9 items-center border border-border bg-sidebar">
          <ToolbarAction icon={<Wrench />} label="Tools" />
          <ToolbarAction icon={<Wrench />} label="Disabled" disabled />
        </div>
      </Specimen>
      <Specimen name="app-session-stats" title="SessionStats" source="components/app/topbar/session-stats.tsx" variants={["normal", "context above 70%"]}>
        <div className="flex h-9 items-center gap-8 border border-border bg-sidebar">
          <SessionStats {...sessionStats} />
          <SessionStats {...sessionStats} contextPercent={86} />
        </div>
      </Specimen>
    </>
  );
}
