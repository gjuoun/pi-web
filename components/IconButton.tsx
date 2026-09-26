"use client";

import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

interface IconButtonProps extends React.ComponentPropsWithoutRef<"button"> {
  title: string;
  size?: "icon-xs" | "icon-sm" | "icon";
  variant?: "ghost" | "outline" | "destructive";
  active?: boolean;
}

/**
 * A ghost/outline icon-only Button wrapped in a Tooltip, with the tooltip
 * text doubling as the accessible name. Shared across FileExplorer,
 * FileViewer and other toolbar-style icon actions.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  title,
  size = "icon-sm",
  variant = "ghost",
  active = false,
  className,
  ...props
}, ref) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          type="button"
          variant={variant}
          size={size}
          aria-label={title}
          aria-pressed={active}
          data-state={active ? "active" : undefined}
          className={cn(active && "bg-muted text-foreground", className)}
          {...props}
        />
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
});
