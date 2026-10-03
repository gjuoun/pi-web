import { ConfigButton, ConfigDetail, ConfigDetailStack, ConfigEmptyState, ConfigFooter, ConfigListAction, ConfigSidebar, ConfigSidebarItem, ConfigSidebarList, ConfigSidebarText, ConfigSplitView } from "@/components/app/settings-ui";
import { ProviderIcon } from "@/components/ProviderIcon";
import type { ProviderItem } from "../view-types";

/**
 * Settings → Models, composed like the real `ModelsConfig` in its embedded form: the shell is a plain flex
 * row holding the split view AND the footer side by side (which is why the real Save button sits at the right
 * edge, beside the detail pane). Nothing is selected, so the detail is the empty state.
 */
export function SettingsModelsView({ providers }: { providers: ProviderItem[] }) {
  return (
    <div data-slot="settings-models-view" className="flex h-full min-h-0 w-full min-w-0">
      <ConfigSplitView>
        <ConfigSidebar>
          <ConfigSidebarList>
            {providers.map((provider) => (
              <ConfigSidebarItem key={provider.id}>
                <ProviderIcon id={provider.id} size={16} />
                <ConfigSidebarText className="is-grow">{provider.name}</ConfigSidebarText>
              </ConfigSidebarItem>
            ))}
          </ConfigSidebarList>
          <ConfigListAction>Add provider</ConfigListAction>
        </ConfigSidebar>
        <ConfigDetail>
          <ConfigDetailStack className="is-fill">
            <ConfigEmptyState>Select a provider or model</ConfigEmptyState>
          </ConfigDetailStack>
        </ConfigDetail>
      </ConfigSplitView>
      <ConfigFooter>
        <ConfigButton variant="primary">Save</ConfigButton>
      </ConfigFooter>
    </div>
  );
}
