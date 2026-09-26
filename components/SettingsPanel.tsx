"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useTheme } from "@/hooks/useTheme";
import { THEME_OPTIONS } from "@/lib/theme";
import { ThemeIcon } from "./ThemeIcon";
import {
  CHAT_CONTENT_WIDTH_DEFAULT,
  CHAT_CONTENT_WIDTH_MAX,
  CHAT_CONTENT_WIDTH_MIN,
  CHAT_CONTENT_FONT_SIZE_DEFAULT,
  CHAT_CONTENT_FONT_SIZE_MAX,
  CHAT_CONTENT_FONT_SIZE_MIN,
  useChatAppearance,
} from "@/hooks/useChatAppearance";
import { useFontPreferences } from "@/hooks/useFontPreferences";
import { fontPresets } from "@/lib/fonts";
import { FontFamilyPicker } from "./FontFamilyPicker";
import { sendAgentCommand } from "@/lib/agent-client";
import type { ShellToolSettingsResponse } from "@/lib/api-types";
import {
  setLastSettingsSection,
  type SettingsSection,
} from "@/lib/settings-navigation";
import {
  isThinkingExpandedByDefault,
  setThinkingExpandedByDefault,
} from "@/lib/thinking-expansion-preference";
import { ModelsConfig } from "./ModelsConfig";
import { setupPushSubscription } from "@/lib/push-client";
import { SkillsConfig } from "./SkillsConfig";
import { PluginsConfig } from "./PluginsConfig";
import { ConfigButton, ConfigSwitch } from "./SettingsUi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

interface Props {
  cwd: string | null;
  sessionId: string | null;
  initialSection: SettingsSection;
  onClose: () => void;
  onSessionReloaded: () => void;
  quoteSelectionEnabled: boolean;
  onQuoteSelectionChange: (enabled: boolean) => void;
  soundEnabled: boolean;
  onSoundToggle: () => void;
}

export function SettingsSectionIcon({ section, size = 16, strokeWidth = 1.8 }: { section: SettingsSection; size?: number; strokeWidth?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "settings-section-icon",
  };

  if (section === "general") return <svg {...common}><path d="M20 7h-9M14 17H5" /><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /></svg>;
  if (section === "models") return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" /></svg>;
  if (section === "skills") return <svg {...common}><path d="m12 2-10 5 10 5 10-5-10-5Z" /><path d="m2 12 10 5 10-5M2 17l10 5 10-5" /></svg>;
  return <svg {...common}><path d="M9 7V2M15 7V2M6 13V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5a6 6 0 0 1-12 0ZM12 19v3" /></svg>;
}

function GeneralSettings({ sessionId, onSessionReloaded, quoteSelectionEnabled, onQuoteSelectionChange, soundEnabled, onSoundToggle }: Pick<Props, "sessionId" | "onSessionReloaded" | "quoteSelectionEnabled" | "onQuoteSelectionChange" | "soundEnabled" | "onSoundToggle">) {
  const { locale, setLocale, supportedLocales, t } = useI18n();
  const { preference, setThemePreference } = useTheme();
  const { width: chatContentWidth, setWidth: setChatContentWidth, fontSize, setFontSize } = useChatAppearance();
  const { uiFont, monoFont, setUiFont, setMonoFont, resetFont } = useFontPreferences();
  const [shellSettings, setShellSettings] = useState<ShellToolSettingsResponse | null>(null);
  const [shellSaving, setShellSaving] = useState(false);
  const [shellError, setShellError] = useState<string | null>(null);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [pushRegistering, setPushRegistering] = useState(false);
  const [pushStatus, setPushStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [webAuthEnabled, setWebAuthEnabled] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    setThinkingExpanded(isThinkingExpandedByDefault());
    void fetch("/api/web-auth")
      .then((response) => response.ok ? response.json() : null)
      .then((data: { enabled?: boolean } | null) => setWebAuthEnabled(data?.enabled === true))
      .catch(() => {});
  }, []);

  const logOut = async () => {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/web-auth", { method: "DELETE" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      window.location.replace("/login");
    } catch {
      setLogoutError(t("auth.logoutFailed"));
    } finally {
      setLoggingOut(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/tools/settings")
      .then(async (response) => {
        const data = await response.json() as ShellToolSettingsResponse & { error?: string };
        if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
        if (!cancelled) setShellSettings(data);
      })
      .catch((cause) => {
        if (!cancelled) setShellError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, []);

  const togglePowerShell = async (enabled: boolean) => {
    setShellSaving(true);
    setShellError(null);
    try {
      const response = await fetch("/api/tools/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json() as ShellToolSettingsResponse & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      setShellSettings(data);
      if (sessionId) {
        await sendAgentCommand(sessionId, { type: "reload" });
        onSessionReloaded();
      }
    } catch (cause) {
      setShellError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setShellSaving(false);
    }
  };

  const registerPush = async () => {
    if (pushRegistering) return;
    setPushRegistering(true);
    setPushStatus(null);
    try {
      if (typeof window === "undefined" || !("Notification" in window)) {
        throw new Error("unsupported or not permitted");
      }
      const permission = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== "granted") throw new Error("unsupported or not permitted");
      const ok = await setupPushSubscription(locale);
      if (!ok) throw new Error("unsupported or not permitted");
      setPushStatus({ kind: "ok", message: t("settings.pushRegistered") });
    } catch (cause) {
      setPushStatus({ kind: "error", message: `${t("settings.pushRegisterFailed")} ${cause instanceof Error ? cause.message : String(cause)}` });
    } finally {
      setPushRegistering(false);
    }
  };

  return (
    <div data-slot="settings-general" className="mx-auto h-full max-h-full w-full max-w-[680px] overflow-y-auto px-[clamp(18px,4vw,40px)] pt-[26px] pb-10">
      <h2 className="m-0 text-lg font-bold text-foreground">{t("settings.general")}</h2>

      <section className="mt-6 first-of-type:mt-6">
        <h3 className="m-0 mb-1.5 text-[13px] font-semibold text-foreground">{t("settings.appearance")}</h3>
        <RadioGroup
          value={preference}
          onValueChange={(value) => setThemePreference(value as typeof preference)}
          aria-label={t("settings.appearance")}
          className="grid w-full max-w-[420px] grid-cols-3 gap-[3px] p-[3px]"
        >
          {THEME_OPTIONS.map((option) => (
            <label
              key={option.id}
              data-slot="settings-theme-option"
              className="relative flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-[7px] rounded-[5px] px-1.5 text-xs font-normal text-muted-foreground has-[[data-state=checked]]:bg-accent has-[[data-state=checked]]:font-semibold has-[[data-state=checked]]:text-primary has-[[data-state=unchecked]]:hover:bg-accent/60 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary has-[:focus-visible]:outline-offset-1"
            >
              <RadioGroupItem value={option.id} className="absolute inset-0 z-10 cursor-pointer rounded-[5px] border-0 bg-transparent opacity-0" />
              <ThemeIcon preference={option.id} />
              <span data-slot="settings-theme-option-label" className="min-w-0 overflow-wrap-anywhere">{t(option.label)}</span>
            </label>
          ))}
        </RadioGroup>
        <p className="m-0 mb-3 text-[11px] leading-normal text-muted-foreground">{t("settings.fontHint")}</p>
        <div className="flex flex-col gap-3 w-full max-w-[420px] mt-3">
          <FontFamilyPicker
            role="ui"
            label={t("settings.uiFont")}
            value={uiFont ?? ""}
            presets={fontPresets("ui")}
            placeholder={t("settings.fontPlaceholder")}
            resetLabel={t("settings.resetUiFont")}
            onChange={setUiFont}
            onReset={() => resetFont("ui")}
          />
          <FontFamilyPicker
            role="mono"
            label={t("settings.monoFont")}
            value={monoFont ?? ""}
            presets={fontPresets("mono")}
            placeholder={t("settings.fontPlaceholder")}
            resetLabel={t("settings.resetMonoFont")}
            onChange={setMonoFont}
            onReset={() => resetFont("mono")}
          />
        </div>
      </section>

      <section className="mt-[30px]">
        <h3 className="m-0 mb-1.5 text-[13px] font-semibold text-foreground">{t("settings.chat")}</h3>
        <div className="flex w-full max-w-[420px] flex-col gap-3">
          <div className="flex min-h-7 w-full items-center justify-between gap-4 text-xs text-foreground">
            <span>{t("settings.thinkingExpandedDefault")}</span>
            <ConfigSwitch
              checked={thinkingExpanded}
              label={t("settings.thinkingExpandedDefault")}
              onChange={(enabled) => {
                setThinkingExpandedByDefault(enabled);
                setThinkingExpanded(enabled);
              }}
            />
          </div>
          <div className="w-full text-xs text-foreground">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-2">
              <label htmlFor="settings-chat-content-width">{t("settings.messageWidth")}</label>
              <output htmlFor="settings-chat-content-width" className="font-mono text-[11px] text-muted-foreground">{chatContentWidth}px</output>
              <Button
                variant="ghost"
                size="icon-sm"
                title={t("settings.resetMessageWidth")}
                aria-label={t("settings.resetMessageWidth")}
                disabled={chatContentWidth === CHAT_CONTENT_WIDTH_DEFAULT}
                onClick={() => setChatContentWidth(CHAT_CONTENT_WIDTH_DEFAULT)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />
                </svg>
              </Button>
            </div>
            <input
              id="settings-chat-content-width"
              type="range"
              min={CHAT_CONTENT_WIDTH_MIN}
              max={CHAT_CONTENT_WIDTH_MAX}
              step={10}
              value={chatContentWidth}
              onChange={(event) => setChatContentWidth(Number(event.target.value))}
              className="mt-0.5 block w-full accent-primary"
            />
          </div>
          <div className="w-full text-xs text-foreground">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-2">
              <label htmlFor="settings-chat-content-font-size">{t("settings.chatContentFontSize")}</label>
              <output htmlFor="settings-chat-content-font-size" className="font-mono text-[11px] text-muted-foreground">{fontSize}px</output>
              <Button
                variant="ghost"
                size="icon-sm"
                title={t("settings.resetChatContentFontSize")}
                aria-label={t("settings.resetChatContentFontSize")}
                disabled={fontSize === CHAT_CONTENT_FONT_SIZE_DEFAULT}
                onClick={() => setFontSize(CHAT_CONTENT_FONT_SIZE_DEFAULT)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />
                </svg>
              </Button>
            </div>
            <input
              id="settings-chat-content-font-size"
              type="range"
              min={CHAT_CONTENT_FONT_SIZE_MIN}
              max={CHAT_CONTENT_FONT_SIZE_MAX}
              step={1}
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
              className="mt-0.5 block w-full accent-primary"
            />
          </div>
          <div className="flex min-h-7 w-full items-center justify-between gap-4 text-xs text-foreground">
            <span>{t("settings.quoteSelection")}</span>
            <ConfigSwitch
              checked={quoteSelectionEnabled}
              label={t("settings.quoteSelection")}
              onChange={onQuoteSelectionChange}
            />
          </div>
          <div className="flex min-h-7 w-full items-center justify-between gap-4 text-xs text-foreground">
            <span>{t("settings.completionSound")}</span>
            <ConfigSwitch
              checked={soundEnabled}
              label={t("settings.completionSound")}
              onChange={onSoundToggle}
            />
          </div>
        </div>
      </section>

      {shellSettings?.isWindows && (
        <section className="mt-[30px]">
          <h3 className="m-0 mb-1.5 text-[13px] font-semibold text-foreground">{t("settings.shellTool")}</h3>
          <p className="m-0 mb-3 text-[11px] leading-normal text-muted-foreground">{t("settings.shellToolDescription")}</p>
          <div className="flex min-h-11 w-full max-w-[420px] items-center justify-between gap-4 rounded-[5px] bg-sidebar px-2.5 text-xs text-foreground">
            <span>{t("settings.usePowerShell")}</span>
            <ConfigSwitch
              checked={shellSettings.powerShellEnabled}
              loading={shellSaving}
              label={t("settings.usePowerShell")}
              onChange={(enabled) => void togglePowerShell(enabled)}
            />
          </div>
          {shellError && <p role="alert" className="mt-2 text-[11px] text-destructive">{shellError}</p>}
        </section>
      )}

      <section className="mt-[30px]">
        <h3 className="m-0 mb-1.5 text-[13px] font-semibold text-foreground">{t("settings.pushPermission")}</h3>
        <p className="m-0 mb-3 text-[11px] leading-normal text-muted-foreground">{t("settings.pushPermissionDescription")}</p>
        <div className="flex min-h-11 w-full max-w-[420px] items-center justify-between gap-4 rounded-[5px] bg-sidebar px-2.5 text-xs text-foreground">
          <span>{t("settings.pushPermission")}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pushRegistering}
            onClick={() => void registerPush()}
          >
            {pushRegistering ? t("settings.pushRegisterLoading") : t("settings.pushRegister")}
          </Button>
        </div>
        {pushStatus && (
          <p
            role="status"
            className={cn("mt-2 text-[11px]", pushStatus.kind === "ok" ? "text-primary" : "text-destructive")}
          >
            {pushStatus.message}
          </p>
        )}
      </section>

      <section className="mt-[30px]">
        <h3 className="m-0 mb-1.5 text-[13px] font-semibold text-foreground">{t("common.language")}</h3>
        <div role="radiogroup" aria-label={t("common.language")} data-slot="settings-language-options" className="flex w-full max-w-[420px] flex-col gap-[3px]">
          {supportedLocales.map((plugin) => {
            const selected = locale === plugin.id;
            return (
              <button
                key={plugin.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setLocale(plugin.id as typeof locale)}
                className={cn(
                  "flex h-11 items-center gap-2.5 rounded-[5px] px-2.5 text-left text-xs text-foreground",
                  selected ? "bg-accent" : "hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none",
                )}
              >
                <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border", selected ? "border-primary" : "border-input")}>
                  {selected && <span className="size-2 rounded-full bg-primary" />}
                </span>
                <span className="flex-1">{plugin.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{plugin.id}</span>
              </button>
            );
          })}
        </div>
      </section>

      {webAuthEnabled && (
        <section className="mt-[30px]">
          <ConfigButton variant="secondary" disabled={loggingOut} onClick={() => void logOut()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            </svg>
            {loggingOut ? t("auth.loggingOut") : t("auth.logOut")}
          </ConfigButton>
          {logoutError && <p role="alert" className="mt-2 text-[11px] text-destructive">{logoutError}</p>}
        </section>
      )}
    </div>
  );
}

export function SettingsPanel({ cwd, sessionId, initialSection, onClose, onSessionReloaded, quoteSelectionEnabled, onQuoteSelectionChange, soundEnabled, onSoundToggle }: Props) {
  const { t } = useI18n();
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [mountedSections, setMountedSections] = useState<ReadonlySet<SettingsSection>>(
    () => new Set([section]),
  );
  const sections: { id: SettingsSection; label: string; requiresProject: boolean }[] = [
    { id: "general", label: t("settings.general"), requiresProject: false },
    { id: "models", label: t("common.models"), requiresProject: false },
    { id: "skills", label: t("common.skills"), requiresProject: true },
    { id: "plugins", label: t("common.plugins"), requiresProject: true },
  ];

  useEffect(() => setLastSettingsSection(initialSection), [initialSection]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (cwd || (section !== "skills" && section !== "plugins")) return;
    setSection("general");
    setMountedSections((current) => new Set(current).add("general"));
    setLastSettingsSection("general");
  }, [cwd, section]);

  const activateSection = (nextSection: SettingsSection) => {
    setMountedSections((current) => new Set(current).add(nextSection));
    setSection(nextSection);
    setLastSettingsSection(nextSection);
  };

  const sectionHost = (id: SettingsSection, content: ReactNode) => mountedSections.has(id) ? (
    <div
      key={id}
      hidden={section !== id}
      className="h-full w-full min-w-0 min-h-0 flex-1"
    >
      {content}
    </div>
  ) : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-label={t("settings.title")}
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        className="z-[600] flex h-[84vh] max-h-[calc(100dvh-16px)] w-[1080px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-lg p-0 sm:max-w-[calc(100vw-16px)] max-[640px]:h-[calc(100dvh-12px)] max-[640px]:w-[calc(100vw-12px)]"
      >
        <DialogTitle className="sr-only">{t("settings.title")}</DialogTitle>
        <div className="relative flex min-h-[50px] shrink-0 items-center border-b border-border pr-[52px] pl-[18px]">
          <strong className="shrink-0 whitespace-nowrap text-[15px] font-normal text-foreground">{t("settings.title")}</strong>
          <NativeSelect
            aria-label={t("settings.title")}
            value={section}
            onChange={(event) => activateSection(event.target.value as SettingsSection)}
            className="ml-3.5 hidden w-full max-w-[210px] max-[640px]:block"
          >
            {sections.map((item) => (
              <NativeSelectOption key={item.id} value={item.id} disabled={item.requiresProject && !cwd}>
                {item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <nav aria-label={t("settings.title")} className="ml-[22px] flex h-[50px] min-w-0 items-stretch gap-0.5 overflow-x-auto overflow-y-hidden max-[640px]:hidden">
            {sections.map((item) => {
              const selected = section === item.id;
              const disabled = item.requiresProject && !cwd;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-slot="settings-section-tab"
                  aria-current={selected ? "page" : undefined}
                  disabled={disabled}
                  title={disabled ? t("settings.projectRequired") : item.label}
                  onClick={() => activateSection(item.id)}
                  className={cn(
                    "relative flex h-full w-24 flex-none items-center justify-center gap-[5px] whitespace-nowrap border-0 bg-transparent px-0.5 text-xs font-normal outline-none transition-colors",
                    "after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-6 after:-translate-x-1/2 after:scale-x-50 after:rounded-t-sm after:bg-primary after:opacity-0 after:transition-[opacity,transform]",
                    selected
                      ? "font-semibold text-foreground after:scale-x-100 after:opacity-100 focus-visible:outline-none"
                      : "text-muted-foreground not-disabled:hover:text-foreground focus-visible:rounded-sm focus-visible:bg-accent focus-visible:text-foreground",
                    disabled && "cursor-default opacity-38",
                  )}
                >
                  <SettingsSectionIcon section={item.id} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            title={t("i18n.close")}
            aria-label={t("i18n.close")}
            className="absolute top-2.5 right-3.5 text-lg leading-none"
          >
            ×
          </Button>
        </div>

        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {sectionHost("general", <GeneralSettings sessionId={sessionId} onSessionReloaded={onSessionReloaded} quoteSelectionEnabled={quoteSelectionEnabled} onQuoteSelectionChange={onQuoteSelectionChange} soundEnabled={soundEnabled} onSoundToggle={onSoundToggle} />)}
          {sectionHost("models", <ModelsConfig embedded onClose={onClose} />)}
          {cwd && sectionHost("skills", <SkillsConfig embedded key={cwd} cwd={cwd} onClose={onClose} />)}
          {cwd && sectionHost("plugins", <PluginsConfig embedded key={cwd} cwd={cwd} sessionId={sessionId} onClose={onClose} onReloaded={onSessionReloaded} />)}
        </main>
      </DialogContent>
    </Dialog>
  );
}
