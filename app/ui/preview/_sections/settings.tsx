import { SettingsDialogView } from "@/components/app/settings/settings-dialog-view";
import { SettingsGeneralView } from "@/components/app/settings/settings-general-view";
import { SettingsModelsView } from "@/components/app/settings/settings-models-view";
import { SettingsPluginsView } from "@/components/app/settings/settings-plugins-view";
import { SettingsSkillsView } from "@/components/app/settings/settings-skills-view";
import { Specimen } from "@/app/ui/lib/_showcase/specimen";
import { Frame } from "../_showcase/frame";
import { generalSettings, plugins, pluginsCwd, pluginsSummary, providers, skills } from "../_fixtures/settings";

export function SettingsRegion() {
  return (
    <>
      <Specimen name="app-settings-dialog-view" title="SettingsDialogView" source="components/app/settings/settings-dialog-view.tsx" variants={["general", "models", "skills", "plugins"]}>
        <div className="flex flex-col gap-6">
          <Frame name="settings-general" size="dialog"><SettingsDialogView section="general"><SettingsGeneralView settings={generalSettings} /></SettingsDialogView></Frame>
          <Frame name="settings-models" size="dialog"><SettingsDialogView section="models"><SettingsModelsView providers={providers} /></SettingsDialogView></Frame>
          <Frame name="settings-skills" size="dialog"><SettingsDialogView section="skills"><SettingsSkillsView skills={skills} /></SettingsDialogView></Frame>
          <Frame name="settings-plugins" size="dialog"><SettingsDialogView section="plugins"><SettingsPluginsView plugins={plugins} cwd={pluginsCwd} summary={pluginsSummary} /></SettingsDialogView></Frame>
        </div>
      </Specimen>
      <Specimen name="app-settings-general-view" title="SettingsGeneralView" source="components/app/settings/settings-general-view.tsx" variants={["default theme", "broismypro selected"]}>
        <div className="flex flex-wrap gap-6">
          <Frame name="settings-general-dark" size="dialog" className="h-[600px] w-[760px]"><SettingsGeneralView settings={generalSettings} /></Frame>
        </div>
      </Specimen>
      <Specimen name="app-settings-models-view" title="SettingsModelsView" source="components/app/settings/settings-models-view.tsx">
        <p className="text-xs text-muted-foreground">Shown in the dialog above (Models tab).</p>
      </Specimen>
      <Specimen name="app-settings-skills-view" title="SettingsSkillsView" source="components/app/settings/settings-skills-view.tsx">
        <p className="text-xs text-muted-foreground">Shown in the dialog above (Skills tab).</p>
      </Specimen>
      <Specimen name="app-settings-plugins-view" title="SettingsPluginsView" source="components/app/settings/settings-plugins-view.tsx">
        <p className="text-xs text-muted-foreground">Shown in the dialog above (Plugins tab).</p>
      </Specimen>
    </>
  );
}
