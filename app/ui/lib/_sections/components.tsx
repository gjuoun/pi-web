import { PencilIcon, TrashIcon } from "lucide-react";
import { IconButton } from "@/components/app/icon-button";
import { Section } from "../_showcase/section";
import { Specimen } from "../_showcase/specimen";
import { SettingsUiDemo } from "./settings-ui-demo";

/** One specimen per file in components/app/; `page.test.mjs` fails when one is missing. */
export function ComponentsSection() {
  return (
    <Section id="components" title="App components" description="Named components in components/app. Each composes native primitives through their public props and role colours only.">
      <Specimen
        name="app-icon-button"
        title="IconButton"
        source="components/app/icon-button.tsx"
        variants={["ghost", "outline", "destructive", "icon-xs", "icon-sm", "icon", "active"]}
      >
        <IconButton title="Rename" variant="ghost"><PencilIcon /></IconButton>
        <IconButton title="Rename (outline)" variant="outline"><PencilIcon /></IconButton>
        <IconButton title="Delete" variant="destructive"><TrashIcon /></IconButton>
        <IconButton title="Active" active><PencilIcon /></IconButton>
        <IconButton title="Extra small" size="icon-xs"><PencilIcon /></IconButton>
        <IconButton title="Default size" size="icon"><PencilIcon /></IconButton>
      </Specimen>
      <Specimen
        name="app-settings-ui"
        title="Settings kit (Config*)"
        source="components/app/settings-ui.tsx"
        variants={["ConfigPanelShell", "ConfigSplitView", "ConfigSidebar", "ConfigSidebarItem", "ConfigDetail", "ConfigField", "ConfigButton", "ConfigSwitch", "ConfigFooter", "ConfigEmptyState", "ConfigStatusDot"]}
      >
        <SettingsUiDemo />
      </Specimen>
    </Section>
  );
}
