import { Section } from "../_showcase/section";
import { PrimitivesBasic } from "./primitives-basic";
import { PrimitivesForms } from "./primitives-forms";
import { PrimitivesOverlays } from "./primitives-overlays";

export function PrimitivesSection() {
  return (
    <Section id="primitives" title="Native shadcn primitives" description="Everything in components/ui, untouched. Each specimen shows the variants the component's own cva defines.">
      <PrimitivesBasic />
      <PrimitivesForms />
      <PrimitivesOverlays />
    </Section>
  );
}
