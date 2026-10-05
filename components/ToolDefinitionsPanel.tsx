"use client";

import "../app/settings.css";
import { useEffect, useMemo, useState } from "react";
import type { ToolEntry } from "@/lib/types";

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
  return <div className="tool-definitions-empty">{children}</div>;
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
    <div className="tool-definitions-panel">
      <nav className="tool-definitions-sidebar" aria-label={translate("tools.title")}>
        <div className="tool-definitions-list">
          {activeTools && activeTools.length > 0 ? activeTools.map((tool) => {
            const selected = tool.name === selectedTool?.name;
            return (
              <button
                key={tool.name}
                type="button"
                className={`tool-definitions-item${selected ? " selected" : ""}`}
                aria-pressed={selected}
                onClick={() => setSelectedToolName(tool.name)}
              >
                <code>{tool.name}</code>
              </button>
            );
          }) : activeTools ? (
            <EmptyState>{translate("tools.noTools")}</EmptyState>
          ) : (
            <EmptyState>{loading ? translate("tools.loading") : translate("tools.load")}</EmptyState>
          )}
        </div>
      </nav>

      <section className="tool-definition-detail" aria-label={translate("tools.details")}>
        {selectedTool ? (
          <div className="tool-definition-scroll">
            {selectedTool.description && (
              <section className="tool-definition-section">
                <div className="tool-definition-section-label">{translate("tools.description")}</div>
                <div className="tool-definition-description">{selectedTool.description}</div>
              </section>
            )}

            <section className="tool-definition-section">
              <div className="tool-definition-section-label">
                <span>{translate("tools.parameters")}</span>
                <span>{translate("tools.parameterCount", { count: fields.length })}</span>
              </div>
              {fields.length > 0 ? (
                <div className="tool-definition-fields">
                  {fields.map((field) => (
                    <div className="tool-definition-field" key={field.name}>
                      <div className="tool-definition-field-name">
                        <code>{field.name}</code>
                        <span className={field.required ? "required" : undefined}>
                          {translate(field.required ? "tools.required" : "tools.optional")}
                        </span>
                      </div>
                      <div className="tool-definition-field-value">
                        <code className="tool-definition-type">{field.type}</code>
                        {field.description && <div>{field.description}</div>}
                        {field.allowedValues && (
                          <div className="tool-definition-meta">
                            {translate("tools.allowedValues")}: <code>{field.allowedValues}</code>
                          </div>
                        )}
                        {field.defaultValue !== undefined && (
                          <div className="tool-definition-meta">
                            {translate("tools.defaultValue")}: <code>{field.defaultValue}</code>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tool-definition-no-parameters">{translate("tools.noParameters")}</div>
              )}
            </section>

            {selectedTool.promptGuidelines && selectedTool.promptGuidelines.length > 0 && (
              <section className="tool-definition-section">
                <div className="tool-definition-section-label">{translate("tools.guidelines")}</div>
                <ul className="tool-definition-guidelines">
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
