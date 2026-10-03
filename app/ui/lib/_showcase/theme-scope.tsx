import type { ComponentProps } from "react";
import { isDarkTheme, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";

/**
 * Renders a subtree in one theme (`data-theme` on this element), independent of the page's own
 * theme. The theme blocks in globals.css are selected by `[data-theme]` alone, so the raw variables
 * re-resolve here; a dark theme also carries the `dark` class so `dark:` utilities apply. The
 * background and text classes are needed because `color` is inherited already resolved from <html>.
 */
export function ThemeScope({ theme, className, ...props }: ComponentProps<"div"> & { theme: ThemeId }) {
  return (
    <div
      data-theme={theme}
      data-theme-scope={theme}
      className={cn("bg-background text-foreground", isDarkTheme(theme) && "dark", className)}
      {...props}
    />
  );
}

