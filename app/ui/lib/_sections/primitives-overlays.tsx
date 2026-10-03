import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MountWhenVisible } from "../_showcase/mount-when-visible";
import { Specimen } from "../_showcase/specimen";

/** Overlay primitives render their trigger closed; `e2e/ui-lib.mjs` opens them (data-demo hooks). */
export function PrimitivesOverlays() {
  return (
    <>
      <Specimen name="ui-dialog" title="Dialog" source="components/ui/dialog.tsx" variants={["trigger", "open state: e2e"]}>
        <Dialog>
          <DialogTrigger asChild><Button variant="outline" data-demo="ui-dialog">Open dialog</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dialog title</DialogTitle>
              <DialogDescription>Supporting text for the dialog.</DialogDescription>
            </DialogHeader>
            <DialogFooter><Button>Confirm</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </Specimen>
      <Specimen name="ui-alert-dialog" title="Alert dialog" source="components/ui/alert-dialog.tsx" variants={["trigger", "open state: e2e"]}>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="destructive" data-demo="ui-alert-dialog">Delete…</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this item?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Specimen>
      <Specimen name="ui-dropdown-menu" title="Dropdown menu" source="components/ui/dropdown-menu.tsx" variants={["trigger", "open state: e2e"]}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" data-demo="ui-dropdown-menu">Open menu</Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Session</DropdownMenuLabel>
            <DropdownMenuItem>Rename<DropdownMenuShortcut>R</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem>Pin to top</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Specimen>
      <Specimen name="ui-popover" title="Popover" source="components/ui/popover.tsx" variants={["trigger", "open state: e2e"]}>
        <Popover>
          <PopoverTrigger asChild><Button variant="outline" data-demo="ui-popover">Open popover</Button></PopoverTrigger>
          <PopoverContent>
            <PopoverHeader>
              <PopoverTitle>Popover title</PopoverTitle>
              <PopoverDescription>Small floating panel anchored to its trigger.</PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </Specimen>
      <Specimen name="ui-tooltip" title="Tooltip" source="components/ui/tooltip.tsx" variants={["hover to open"]}>
        <Tooltip>
          <TooltipTrigger asChild><Button variant="outline">Hover me</Button></TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </Specimen>
      <Specimen name="ui-command" title="Command" source="components/ui/command.tsx">
        <MountWhenVisible>
          <Command className="w-80 rounded-lg border border-border">
            <CommandInput placeholder="Type a command…" />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup heading="Suggestions">
                <CommandItem>New session<CommandShortcut>N</CommandShortcut></CommandItem>
                <CommandItem>Open settings</CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Other">
                <CommandItem>Toggle terminal</CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </MountWhenVisible>
      </Specimen>
    </>
  );
}
