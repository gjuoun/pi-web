/**
 * Argument parsing for the two builtin commands pi keeps to itself.
 *
 * pi implements /model and /thinking inside the TUI (interactive-mode.ts#L2980-2991) and they never
 * appear in get_commands, so Pi Web owns them. Both are dual-mode: bare opens the selector, and an
 * argument is applied inline when it resolves exactly. These two pure helpers are that resolution —
 * kept out of the hook so the rules can be tested without a React render.
 */

export interface PickerModelRef {
  provider: string;
  modelId: string;
}

/**
 * `/model <provider/modelId>` — an exact match against the visible list, or null.
 *
 * pi does not guess at a near match: anything short of exact opens the selector pre-filled with the
 * argument, which filters the list down to what the user was reaching for anyway.
 */
export function resolveModelArgument(
  args: string,
  models: readonly { provider: string; id: string }[],
): PickerModelRef | null {
  const wanted = args.trim().toLocaleLowerCase();
  if (!wanted) return null;
  const slash = wanted.indexOf("/");
  if (slash <= 0 || slash === wanted.length - 1) return null;
  const provider = wanted.slice(0, slash);
  const modelId = wanted.slice(slash + 1);
  const hit = models.find(
    (model) => model.provider.toLocaleLowerCase() === provider && model.id.toLocaleLowerCase() === modelId,
  );
  return hit ? { provider: hit.provider, modelId: hit.id } : null;
}

/**
 * `/thinking <level>` — the level if the model actually offers it, otherwise null.
 *
 * pi answers an unknown level with an error listing what is available rather than clamping, because
 * silently downgrading "max" to "low" hides the fact that the model cannot reason that hard.
 */
export function resolveThinkingArgument(args: string, levels: readonly string[]): string | null {
  const wanted = args.trim().toLocaleLowerCase();
  if (!wanted) return null;
  const hit = levels.find((level) => level.toLocaleLowerCase() === wanted);
  return hit ?? null;
}
