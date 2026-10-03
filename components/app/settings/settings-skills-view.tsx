import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ConfigDetail, ConfigDetailActions, ConfigDetailHeader, ConfigDetailHeaderInfo, ConfigDetailStack, ConfigField, ConfigFooter, ConfigListAction, ConfigSidebar, ConfigSidebarGroupLabel, ConfigSidebarItem, ConfigSidebarList, ConfigSidebarText, ConfigSplitView, ConfigStatusDot } from "@/components/app/settings-ui";
import type { SkillItem } from "../view-types";

/** Settings → Skills, composed like the real `SkillsConfig`: a grouped list of skills and the selected one's header, name and description. The footer is empty. */
export function SettingsSkillsView({ skills, selectedName }: { skills: SkillItem[]; selectedName?: string }) {
  const selected = skills.find((skill) => skill.name === selectedName) ?? skills[0];
  return (
    <div data-slot="settings-skills-view" className="flex h-full min-h-0 w-full min-w-0">
      <ConfigSplitView>
        <ConfigSidebar>
          <ConfigSidebarList>
            <div className="mb-1.5">
              <ConfigSidebarGroupLabel>global</ConfigSidebarGroupLabel>
              {skills.map((skill) => (
                <ConfigSidebarItem key={skill.name} active={skill.name === selected.name}>
                  <ConfigStatusDot active={skill.enabled} />
                  <ConfigSidebarText className="is-grow">{skill.name}</ConfigSidebarText>
                </ConfigSidebarItem>
              ))}
            </div>
          </ConfigSidebarList>
          <ConfigListAction>Add skill</ConfigListAction>
        </ConfigSidebar>
        <ConfigDetail>
          <ConfigDetailStack className="is-fill">
            <ConfigDetailStack>
              <div className="flex flex-col gap-1">
                <ConfigDetailHeader>
                  <ConfigDetailHeaderInfo>
                    <Badge variant="outline">global</Badge>
                    <span className="min-w-0 flex-1 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-nowrap text-muted-foreground">{selected.path}</span>
                  </ConfigDetailHeaderInfo>
                  <ConfigDetailActions>
                    <span className="inline-flex items-center gap-2"><Switch checked={selected.enabled} /></span>
                  </ConfigDetailActions>
                </ConfigDetailHeader>
                <div className="flex min-h-4 flex-wrap items-center justify-end gap-2 text-right" />
              </div>
              <ConfigField label="Name"><span className="font-mono text-xs text-foreground">{selected.name}</span></ConfigField>
              <ConfigField label="Description"><span className="text-xs leading-normal text-muted-foreground">{selected.description}</span></ConfigField>
            </ConfigDetailStack>
          </ConfigDetailStack>
        </ConfigDetail>
      </ConfigSplitView>
      <ConfigFooter />
    </div>
  );
}
