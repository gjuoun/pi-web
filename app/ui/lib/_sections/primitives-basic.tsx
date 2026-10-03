import { InfoIcon, InboxIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Specimen } from "../_showcase/specimen";

const BUTTON_VARIANTS = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const;
const BUTTON_SIZES = ["xs", "sm", "default", "lg"] as const;

export function PrimitivesBasic() {
  return (
    <>
      <Specimen name="ui-button" title="Button" source="components/ui/button.tsx" variants={[...BUTTON_VARIANTS, ...BUTTON_SIZES.map((size) => `size: ${size}`), "size: icon", "size: icon-xs", "size: icon-sm", "size: icon-lg"]}>
        <div className="flex w-full flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="default">Default</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {BUTTON_SIZES.map((size) => (
              <Button key={size} size={size} variant="outline">{size}</Button>
            ))}
            <Button size="icon-xs" variant="outline" aria-label="icon-xs"><InfoIcon /></Button>
            <Button size="icon-sm" variant="outline" aria-label="icon-sm"><InfoIcon /></Button>
            <Button size="icon" variant="outline" aria-label="icon"><InfoIcon /></Button>
            <Button size="icon-lg" variant="outline" aria-label="icon-lg"><InfoIcon /></Button>
          </div>
        </div>
      </Specimen>
      <Specimen name="ui-badge" title="Badge" source="components/ui/badge.tsx" variants={["default", "secondary", "destructive", "outline", "ghost"]}>
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="destructive">Destructive</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="ghost">Ghost</Badge>
      </Specimen>
      <Specimen name="ui-alert" title="Alert" source="components/ui/alert.tsx" variants={["default", "destructive"]}>
        <div className="flex w-full flex-col gap-3">
          <Alert>
            <InfoIcon />
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>A neutral message about the current state.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Something failed</AlertTitle>
            <AlertDescription>The request could not be completed.</AlertDescription>
          </Alert>
        </div>
      </Specimen>
      <Specimen name="ui-card" title="Card" source="components/ui/card.tsx" variants={["default", "sm"]}>
        <Card className="w-72">
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Supporting description.</CardDescription>
            <CardAction><Badge variant="secondary">New</Badge></CardAction>
          </CardHeader>
          <CardContent>Body content sits here.</CardContent>
          <CardFooter><Button size="sm">Action</Button></CardFooter>
        </Card>
        <Card size="sm" className="w-72">
          <CardHeader>
            <CardTitle>Small card</CardTitle>
            <CardDescription>Tighter spacing.</CardDescription>
          </CardHeader>
          <CardContent>Body content sits here.</CardContent>
        </Card>
      </Specimen>
      <Specimen name="ui-separator" title="Separator" source="components/ui/separator.tsx" variants={["horizontal", "vertical"]}>
        <div className="flex w-full flex-col gap-3">
          <Separator />
          <div className="flex h-5 items-center gap-3 text-sm">
            <span>One</span>
            <Separator orientation="vertical" />
            <span>Two</span>
            <Separator orientation="vertical" />
            <span>Three</span>
          </div>
        </div>
      </Specimen>
      <Specimen name="ui-spinner" title="Spinner" source="components/ui/spinner.tsx">
        <Spinner />
        <Spinner className="size-6" />
      </Specimen>
      <Specimen name="ui-progress" title="Progress" source="components/ui/progress.tsx">
        <div className="flex w-64 flex-col gap-3">
          <Progress value={25} />
          <Progress value={70} />
        </div>
      </Specimen>
      <Specimen name="ui-label" title="Label" source="components/ui/label.tsx">
        <Label>Field label</Label>
      </Specimen>
      <Specimen name="ui-empty" title="Empty" source="components/ui/empty.tsx" variants={["media: default", "media: icon"]}>
        <Empty className="border border-dashed border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><InboxIcon /></EmptyMedia>
            <EmptyTitle>Nothing here yet</EmptyTitle>
            <EmptyDescription>Items you add will show up in this list.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Specimen>
      <Specimen name="ui-item" title="Item" source="components/ui/item.tsx" variants={["default", "outline", "muted", "size: default", "size: sm", "size: xs"]}>
        <div className="flex w-full max-w-md flex-col gap-2">
          {(["default", "outline", "muted"] as const).map((variant) => (
            <Item key={variant} variant={variant}>
              <ItemMedia variant="icon"><InfoIcon /></ItemMedia>
              <ItemContent>
                <ItemTitle>{variant} item</ItemTitle>
                <ItemDescription>Title, description and an action.</ItemDescription>
              </ItemContent>
              <ItemActions><Button size="xs" variant="outline">Open</Button></ItemActions>
            </Item>
          ))}
        </div>
      </Specimen>
    </>
  );
}
