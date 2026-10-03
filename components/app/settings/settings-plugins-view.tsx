import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ConfigDetail, ConfigDetailActions, ConfigDetailHeader, ConfigDetailHeaderInfo, ConfigDetailStack, ConfigFooter, ConfigListAction, ConfigSectionTitle, ConfigSidebar, ConfigSidebarGroupLabel, ConfigSidebarItem, ConfigSidebarList, ConfigSidebarText, ConfigSplitView, ConfigStatusDot } from "@/components/app/settings-ui";
import type { PluginItem } from "../view-types";

/** The detail grid's label / value pairs, as the real `PluginsConfig` lays them out. */
function InfoRows({ rows }: { rows: { label: string; value: React.ReactNode; className?: string }[] }) {
  return (
    <div className="grid grid-cols-[minmax(96px,130px)_minmax(0,1fr)] gap-x-3.5 gap-y-2.5 text-xs leading-normal">
      {rows.map(({ label, value, className }) => (
        <div key={label} className="contents">
          <div className="text-muted-foreground">{label}</div>
          <div className={className}>{value}</div>
        </div>
      ))}
    </div>
  );
}

/** Settings → Plugins, composed like the real `PluginsConfig`: packages by path in a grouped list, the selected one's actions, info grid and resolved resources, and the totals with a Refresh button in the footer. */
export function SettingsPluginsView({ plugins, cwd, summary, selectedName }: { plugins: PluginItem[]; cwd: string; summary: string; selectedName?: string }) {
  const selected = plugins.find((plugin) => plugin.name === selectedName) ?? plugins[0];
  return (
    <div data-slot="settings-plugins-view" className="flex h-full min-h-0 w-full min-w-0">
      <ConfigSplitView>
        <ConfigSidebar>
          <ConfigSidebarList>
            <div className="mb-1.5">
              <ConfigSidebarGroupLabel>global</ConfigSidebarGroupLabel>
              {plugins.map((plugin) => (
                <ConfigSidebarItem key={plugin.name} active={plugin.name === selected.name}>
                  <ConfigStatusDot active={plugin.enabled} color={plugin.enabled ? "var(--primary)" : "var(--muted-foreground)"} />
                  <ConfigSidebarText className={cn("is-grow", !plugin.enabled && "is-muted")}>{plugin.path}</ConfigSidebarText>
                </ConfigSidebarItem>
              ))}
            </div>
          </ConfigSidebarList>
          <ConfigListAction>Add plugin</ConfigListAction>
        </ConfigSidebar>
        <ConfigDetail>
          <ConfigDetailStack className="is-fill">
            <ConfigDetailStack>
              <ConfigDetailHeader className="is-top-aligned">
                <ConfigDetailHeaderInfo>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{selected.scope}</Badge>
                  <span className="overflow-hidden font-mono text-xs text-ellipsis whitespace-nowrap text-foreground">{selected.path}</span>
                </ConfigDetailHeaderInfo>
                <ConfigDetailActions>
                  <Button variant="outline" size="sm">Update</Button>
                  <Button variant="outline" size="sm" title="Reload session">Reload session</Button>
                  <Button variant="destructive" size="sm">Remove</Button>
                  <span className="inline-flex items-center gap-2"><Switch checked={selected.enabled} /></span>
                </ConfigDetailActions>
              </ConfigDetailHeader>
              <InfoRows
                rows={[
                  { label: "Status", value: selected.status, className: "capitalize text-primary" },
                  { label: "Version", value: <div className="flex flex-wrap items-center gap-2.5"><span className="font-mono text-xs text-muted-foreground">{`installed ${selected.version}`}</span></div>, className: "flex min-w-0 flex-col gap-1" },
                  { label: "Package", value: selected.name, className: "font-mono break-words text-muted-foreground" },
                  { label: "Resources", value: selected.resources, className: "text-muted-foreground" },
                  { label: "Installed path", value: selected.path, className: "font-mono break-words text-muted-foreground" },
                  { label: "CWD", value: cwd, className: "font-mono break-words text-muted-foreground" },
                ]}
              />
              <div className="flex flex-col gap-2">
                <ConfigSectionTitle>Resolved Resources</ConfigSectionTitle>
                <div className="flex flex-col gap-3">
                  <div className="border-t-0 pt-0">
                    <div className="mb-1.5 text-[10px] font-bold text-muted-foreground uppercase">Extensions</div>
                    <div className="flex flex-col gap-1.5">
                      <div className="min-w-0">
                        <div className="overflow-hidden font-mono text-xs text-ellipsis whitespace-nowrap text-foreground" title={selected.path}>{selected.name}</div>
                        <div className="mt-px overflow-hidden font-mono text-[10px] text-ellipsis whitespace-nowrap text-muted-foreground" title={selected.path}>{selected.path}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ConfigDetailStack>
          </ConfigDetailStack>
        </ConfigDetail>
      </ConfigSplitView>
      <ConfigFooter status={<span>{summary}</span>}>
        <Button variant="outline">Refresh</Button>
      </ConfigFooter>
    </div>
  );
}
