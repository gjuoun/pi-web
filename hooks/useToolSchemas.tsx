"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
	buildToolSchemaMap,
	lookupToolSchema,
	mergeToolSchemaCache,
	type ToolSchemaCache,
} from "@/lib/tool-schema";
import type { ToolEntry } from "@/lib/tool-presets";

/**
 * The session's tool schemas, keyed by tool name — the only channel a tool has
 * to declare how its arguments should be displayed (see `lib/tool-schema.ts`,
 * which reads JSON Schema's `contentMediaType` off these schemas).
 *
 * Two sources, both real declarations:
 *   - `live`: what this session's `get_tools` just reported;
 *   - a remembered cache, because the tool list only arrives when something asks
 *     for it. Without the cache, a tool call read in an idle session would fall
 *     back to JSON even though its tool declares how to render it.
 *
 * `requestSchemas()` asks the host to load the live list when a rendered call
 * needs a declaration nobody has seen yet; the host decides whether that is
 * worth doing.
 */
const CACHE_KEY = "pi-tool-schemas";

function readCache(): ToolSchemaCache {
	try {
		const raw = window.localStorage.getItem(CACHE_KEY);
		const parsed = raw ? JSON.parse(raw) : null;
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as ToolSchemaCache)
			: {};
	} catch {
		return {};
	}
}

function writeCache(cache: ToolSchemaCache): void {
	try {
		window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
	} catch {
		// Remembering is best-effort; the live schemas still work.
	}
}

interface ToolSchemasContextValue {
	live: ReadonlyMap<string, Record<string, unknown>>;
	cache: ToolSchemaCache;
	requestSchemas: () => void;
}

const EMPTY_SCHEMAS = new Map<string, Record<string, unknown>>();

const ToolSchemasContext = createContext<ToolSchemasContextValue>({
	live: EMPTY_SCHEMAS,
	cache: {},
	requestSchemas: () => {},
});

export function ToolSchemasProvider({
	tools,
	onRequestSchemas,
	children,
}: {
	tools: ToolEntry[] | null;
	onRequestSchemas?: () => void;
	children: ReactNode;
}) {
	const live = useMemo(() => buildToolSchemaMap(tools), [tools]);
	const [cache, setCache] = useState<ToolSchemaCache>({});

	// Hydrate from storage after mount: the server-rendered pass has no window.
	useEffect(() => {
		setCache(readCache());
	}, []);

	useEffect(() => {
		if (live.size === 0) return;
		setCache((previous) => {
			const { cache: next, changed } = mergeToolSchemaCache(previous, live);
			if (changed) writeCache(next);
			return changed ? next : previous;
		});
	}, [live]);

	const requestSchemas = useCallback(() => {
		onRequestSchemas?.();
	}, [onRequestSchemas]);

	const value = useMemo(
		() => ({ live, cache, requestSchemas }),
		[live, cache, requestSchemas],
	);

	return <ToolSchemasContext.Provider value={value}>{children}</ToolSchemasContext.Provider>;
}

/** A tool's declared parameter schema: this session's, or one remembered earlier. */
export function useToolParameters(toolName: string): Record<string, unknown> | undefined {
	const { live, cache } = useContext(ToolSchemasContext);
	return lookupToolSchema(toolName, live, cache);
}

/** Ask the host to load the live tool list, if it has not been loaded yet. */
export function useRequestToolSchemas(): () => void {
	return useContext(ToolSchemasContext).requestSchemas;
}
