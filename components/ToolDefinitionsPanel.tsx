"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToolEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

type Translate = (key: string, params?: Record<string, string | number>) => string;

interface Props {
  loading: boolean;
  tools: ToolEntry[] | null;
  translate: Translate;
}

interface ParameterField {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  allowedValues?: string;
  defaultValue?: string;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatSchemaType(schema: Record<string, unknown>): string {
  const variants = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf)
      ? schema.oneOf
      : null;
  if (variants) {
    return variants
      .map((variant) => variant && typeof variant === "object"
        ? formatSchemaType(variant as Record<string, unknown>)
        : "unknown")
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(" | ");
  }

  if (schema.const !== undefined) return formatValue(schema.const);
  if (Array.isArray(schema.enum) && schema.enum.length > 0 && schema.type === undefined) {
    return [...new Set(schema.enum.map((value) => value === null ? "null" : typeof value))].join(" | ");
  }

  const rawType = schema.type;
  const type = Array.isArray(rawType)
    ? rawType.filter((value): value is string => typeof value === "string").join(" | ")
    : typeof rawType === "string"
      ? rawType
      : typeof schema.$ref === "string"
        ? schema.$ref.split("/").pop() ?? "object"
        : "unknown";

  if (type === "array") {
    const items = schema.items;
    const itemType = items && typeof items === "object"
      ? formatSchemaType(items as Record<string, unknown>)
      : "unknown";
    return `${itemType}[]`;
  }
  return type;
}

export function getToolParameterFields(parameters?: Record<string, unknown>): ParameterField[] {
  if (!parameters || !parameters.properties || typeof parameters.properties !== "object") return [];
  const properties = parameters.properties as Record<string, unknown>;
  const required = new Set(
    Array.isArray(parameters.required)
      ? parameters.required.filter((value): value is string => typeof value === "string")
      : [],
  );

  return Object.entries(properties).map(([name, value]) => {
    const schema = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      name,
      type: formatSchemaType(schema),
      description: typeof schema.description === "string" ? schema.description : undefined,
      required: required.has(name),
      allowedValues: Array.isArray(schema.enum) ? schema.enum.map(formatValue).join(", ") : undefined,
      defaultValue: schema.default === undefined ? undefined : formatValue(schema.default),
    };
  });
}

function EmptyState({ children }: { children: string }) {
  return <div className="overflow-wrap-anywhere p-3.5 px-3 text-xs text-muted-foreground italic">{children}</div>;
}

export function ToolDefinitionsPanel({ loading, tools, translate }: Props) {
  const activeTools = useMemo(() => tools?.filter((tool) => tool.active) ?? null, [tools]);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);

  useEffect(() => {
    setSelectedToolName((current) => (
      activeTools?.some((tool) => tool.name === current)
        ? current
        : activeTools?.[0]?.name ?? null
    ));
  }, [activeTools]);

  const selectedTool = activeTools?.find((tool) => tool.name === selectedToolName)
    ?? activeTools?.[0]
    ?? null;
  const fields = selectedTool ? getToolParameterFields(selectedTool.parameters) : [];

  return (
    <div className="grid h-[min(600px,75dvh)] min-h-60 grid-cols-[112px_minmax(0,1fr)] overflow-hidden border-b border-border bg-card sm:grid-cols-[clamp(112px,26%,220px)_minmax(0,1fr)]">
      <nav data-slot="tool-definitions-sidebar" className="flex min-h-0 min-w-0 flex-col border-r border-border bg-[color-mix(in_srgb,var(--card)_94%,var(--background))]" aria-label={translate("tools.title")}>
        <div className="min-h-0 flex-1 overflow-auto">
          {activeTools && activeTools.length > 0 ? activeTools.map((tool) => {
            const selected = tool.name === selectedTool?.name;
            return (
              <button
                key={tool.name}
                type="button"
                className={cn(
                  "flex min-h-[38px] w-full items-center border-none border-b border-border bg-transparent px-3 py-2 text-left text-muted-foreground max-[640px]:px-2.5",
                  selected
                    ? "bg-accent text-foreground shadow-[inset_2px_0_0_var(--primary)]"
                    : "hover:bg-accent hover:text-foreground",
                )}
                aria-pressed={selected}
                onClick={() => setSelectedToolName(tool.name)}
              >
                <code className="max-w-full overflow-wrap-anywhere text-[11px] font-semibold text-inherit">{tool.name}</code>
              </button>
            );
          }) : activeTools ? (
            <EmptyState>{translate("tools.noTools")}</EmptyState>
          ) : (
            <EmptyState>{loading ? translate("tools.loading") : translate("tools.load")}</EmptyState>
          )}
        </div>
      </nav>

      <section data-slot="tool-definition-detail" className="flex min-h-0 min-w-0 flex-col" aria-label={translate("tools.details")}>
        {selectedTool ? (
          <div className="min-h-0 flex-1 overflow-auto p-3.5 px-4 pb-5 max-[640px]:p-3 [&>section+section]:mt-[18px]">
            {selectedTool.description && (
              <section>
                <div className="mb-[7px] flex items-center justify-between gap-2 text-[11px] font-semibold text-muted-foreground">{translate("tools.description")}</div>
                <div className="overflow-wrap-anywhere text-xs leading-[1.55] whitespace-pre-wrap text-muted-foreground">{selectedTool.description}</div>
              </section>
            )}

            <section>
              <div className="mb-[7px] flex items-center justify-between gap-2 text-[11px] font-semibold text-muted-foreground">
                <span>{translate("tools.parameters")}</span>
                <span className="font-normal whitespace-nowrap">{translate("tools.parameterCount", { count: fields.length })}</span>
              </div>
              {fields.length > 0 ? (
                <div className="border-t border-border">
                  {fields.map((field) => (
                    <div
                      className="grid grid-cols-[minmax(88px,0.75fr)_minmax(0,1.5fr)] gap-3 border-b border-border py-[9px] text-[11px] leading-[1.45] max-[640px]:grid-cols-[minmax(74px,0.7fr)_minmax(0,1.3fr)] max-[640px]:gap-2.5"
                      key={field.name}
                    >
                      <div className="flex min-w-0 flex-col gap-[3px] text-foreground">
                        <code className="overflow-wrap-anywhere">{field.name}</code>
                        <span className={cn("text-[10px] text-muted-foreground", field.required && "text-primary")}>
                          {translate(field.required ? "tools.required" : "tools.optional")}
                        </span>
                      </div>
                      <div className="min-w-0 overflow-wrap-anywhere text-muted-foreground">
                        <code className="mb-[3px] block text-foreground">{field.type}</code>
                        {field.description && <div>{field.description}</div>}
                        {field.allowedValues && (
                          <div className="mt-1 text-muted-foreground">
                            {translate("tools.allowedValues")}: <code className="text-muted-foreground">{field.allowedValues}</code>
                          </div>
                        )}
                        {field.defaultValue !== undefined && (
                          <div className="mt-1 text-muted-foreground">
                            {translate("tools.defaultValue")}: <code className="text-muted-foreground">{field.defaultValue}</code>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pt-0.5 pb-2.5 text-[11px] text-muted-foreground">{translate("tools.noParameters")}</div>
              )}
            </section>

            {selectedTool.promptGuidelines && selectedTool.promptGuidelines.length > 0 && (
              <section>
                <div className="mb-[7px] flex items-center justify-between gap-2 text-[11px] font-semibold text-muted-foreground">{translate("tools.guidelines")}</div>
                <ul className="m-0 list-disc space-y-0 pl-[18px] text-[11px] leading-[1.5] text-muted-foreground">
                  {selectedTool.promptGuidelines.map((guideline, index) => (
                    <li key={`${selectedTool.name}:${index}`}>{guideline}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : (
          <EmptyState>
            {activeTools
              ? translate("tools.noTools")
              : loading
                ? translate("tools.loading")
                : translate("tools.load")}
          </EmptyState>
        )}
      </section>
    </div>
  );
}
