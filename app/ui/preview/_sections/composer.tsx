import { ComposerChip } from "@/components/app/chat/composer-chip";
import { ComposerView } from "@/components/app/chat/composer-view";
import { StatusBarView } from "@/components/app/chat/status-bar-view";
import { Specimen } from "@/app/ui/lib/_showcase/specimen";
import { Frame } from "../_showcase/frame";
import { freshStatusBar, statusBar } from "../_fixtures/conversation";

const chips = [
  { id: "a", label: "diagram.png" },
  { id: "b", label: "error.png" },
];
const queued = [
  { kind: "steer", text: "then run the e2e" },
  { kind: "follow-up", text: "and update the docs" },
] as const;

export function ComposerRegion() {
  return (
    <>
      <Specimen name="app-composer-view" title="ComposerView" source="components/app/chat/composer-view.tsx" variants={["idle", "chips + queued", "busy"]}>
        <div className="flex w-full flex-col gap-4">
          <Frame name="composer-idle" size="region"><div className="relative w-full shrink-0"><ComposerView /><StatusBarView {...statusBar} /></div></Frame>
          <Frame name="composer-queued" size="region"><div className="relative w-full shrink-0"><ComposerView chips={chips} queued={[...queued]} /><StatusBarView {...statusBar} /></div></Frame>
          <Frame name="composer-busy" size="region"><div className="relative w-full shrink-0"><ComposerView busy /><StatusBarView {...statusBar} /></div></Frame>
        </div>
      </Specimen>
      <Specimen name="app-composer-chip" title="ComposerChip" source="components/app/chat/composer-chip.tsx" variants={["image attachment"]}>
        <ComposerChip label="diagram.png" />
      </Specimen>
      <Specimen name="app-status-bar-view" title="StatusBarView" source="components/app/chat/status-bar-view.tsx" variants={["session", "fresh session", "context above 70%"]}>
        <div className="flex w-full flex-col gap-4">
          <Frame name="status-session" size="region"><div className="relative w-full shrink-0"><StatusBarView {...statusBar} /></div></Frame>
          <Frame name="status-fresh" size="region"><div className="relative w-full shrink-0"><StatusBarView {...freshStatusBar} fresh /></div></Frame>
          <Frame name="status-context" size="region"><div className="relative w-full shrink-0"><StatusBarView {...statusBar} contextPercent={86} /></div></Frame>
        </div>
      </Specimen>
    </>
  );
}
