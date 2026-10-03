"use client";

import { useState } from "react";
import {
  ConfigButton,
  ConfigDetail,
  ConfigDetailActions,
  ConfigDetailHeader,
  ConfigDetailHeaderInfo,
  ConfigDetailStack,
  ConfigDetailTitle,
  ConfigEmptyState,
  ConfigField,
  ConfigFooter,
  ConfigListAction,
  ConfigPanelShell,
  ConfigSectionTitle,
  ConfigSidebar,
  ConfigSidebarGroupLabel,
  ConfigSidebarItem,
  ConfigSidebarList,
  ConfigSidebarText,
  ConfigSplitView,
  ConfigStatusDot,
  ConfigSwitch,
} from "@/components/app/settings-ui";
import { Input } from "@/components/ui/input";

/** The settings kit composed the way ModelsConfig/SkillsConfig/PluginsConfig use it (embedded form). */
export function SettingsUiDemo() {
  const [enabled, setEnabled] = useState(true);
  return (
    <div className="h-[380px] w-full overflow-hidden rounded-lg border border-border">
      <ConfigPanelShell embedded title="Providers" onClose={() => {}}>
        <ConfigSplitView>
          <ConfigSidebar>
            <ConfigSidebarList>
              <ConfigSidebarGroupLabel>Configured</ConfigSidebarGroupLabel>
              <ConfigSidebarItem active>
                <ConfigStatusDot active />
                <ConfigSidebarText>Anthropic</ConfigSidebarText>
              </ConfigSidebarItem>
              <ConfigSidebarItem>
                <ConfigStatusDot />
                <ConfigSidebarText>OpenAI</ConfigSidebarText>
              </ConfigSidebarItem>
            </ConfigSidebarList>
            <ConfigListAction>Add provider</ConfigListAction>
          </ConfigSidebar>
          <div className="flex min-w-0 flex-1 flex-col">
            <ConfigDetail>
              <ConfigDetailStack>
                <ConfigDetailHeader>
                  <ConfigDetailHeaderInfo>
                    <ConfigDetailTitle>Anthropic</ConfigDetailTitle>
                  </ConfigDetailHeaderInfo>
                  <ConfigDetailActions>
                    <ConfigSwitch checked={enabled} label="Enabled" onChange={setEnabled} />
                    <ConfigButton variant="danger" size="small">Remove</ConfigButton>
                  </ConfigDetailActions>
                </ConfigDetailHeader>
                <ConfigSectionTitle>Connection</ConfigSectionTitle>
                <ConfigField label="API key">
                  <Input type="password" defaultValue="sk-demo" />
                </ConfigField>
                <ConfigEmptyState>No custom models yet.</ConfigEmptyState>
              </ConfigDetailStack>
            </ConfigDetail>
            <ConfigFooter status="Saved">
              <ConfigButton variant="ghost">Cancel</ConfigButton>
              <ConfigButton variant="primary">Save</ConfigButton>
            </ConfigFooter>
          </div>
        </ConfigSplitView>
      </ConfigPanelShell>
    </div>
  );
}
