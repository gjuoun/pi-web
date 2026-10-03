import { TimelineMinimap } from "@/components/app/chat/timeline-minimap";
import { Specimen } from "@/app/ui/lib/_showcase/specimen";
import { Frame } from "../_showcase/frame";
import { minimapNodes } from "../_fixtures/conversation";

export function TimelineRegion() {
  return (
    <Specimen name="app-timeline-minimap" title="TimelineMinimap" source="components/app/chat/timeline-minimap.tsx" variants={["nodes + active", "hover preview open"]}>
      <div className="flex flex-wrap items-start gap-6">
        <Frame name="timeline-default" size="rail"><div className="flex-1" /><TimelineMinimap nodes={minimapNodes} /></Frame>
        <Frame name="timeline-preview" size="rail"><div className="flex-1" /><TimelineMinimap nodes={minimapNodes} open locatedIndex={1} /></Frame>
      </div>
    </Specimen>
  );
}
