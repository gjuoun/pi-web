import { BoldIcon, ItalicIcon, SearchIcon, UnderlineIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Specimen } from "../_showcase/specimen";

export function PrimitivesForms() {
  return (
    <>
      <Specimen name="ui-input" title="Input" source="components/ui/input.tsx" variants={["default", "disabled", "invalid"]}>
        <Input className="w-56" placeholder="Default" />
        <Input className="w-56" placeholder="Disabled" disabled />
        <Input className="w-56" placeholder="Invalid" aria-invalid defaultValue="not valid" />
      </Specimen>
      <Specimen name="ui-textarea" title="Textarea" source="components/ui/textarea.tsx">
        <Textarea className="w-72" placeholder="Write a message…" />
      </Specimen>
      <Specimen name="ui-checkbox" title="Checkbox" source="components/ui/checkbox.tsx" variants={["unchecked", "checked", "disabled"]}>
        <Label><Checkbox /> Unchecked</Label>
        <Label><Checkbox defaultChecked /> Checked</Label>
        <Label><Checkbox disabled /> Disabled</Label>
      </Specimen>
      <Specimen name="ui-switch" title="Switch" source="components/ui/switch.tsx" variants={["default", "sm", "disabled"]}>
        <Switch />
        <Switch defaultChecked />
        <Switch size="sm" defaultChecked />
        <Switch disabled />
      </Specimen>
      <Specimen name="ui-radio-group" title="Radio group" source="components/ui/radio-group.tsx">
        <RadioGroup defaultValue="b">
          <Label><RadioGroupItem value="a" /> Option A</Label>
          <Label><RadioGroupItem value="b" /> Option B</Label>
          <Label><RadioGroupItem value="c" disabled /> Option C (disabled)</Label>
        </RadioGroup>
      </Specimen>
      <Specimen name="ui-native-select" title="Native select" source="components/ui/native-select.tsx">
        <NativeSelect className="w-48" defaultValue="two">
          <NativeSelectOption value="one">One</NativeSelectOption>
          <NativeSelectOption value="two">Two</NativeSelectOption>
        </NativeSelect>
      </Specimen>
      <Specimen name="ui-select" title="Select" source="components/ui/select.tsx" variants={["trigger", "open state: e2e"]}>
        <Select defaultValue="two">
          <SelectTrigger className="w-48" data-demo="ui-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="one">One</SelectItem>
            <SelectItem value="two">Two</SelectItem>
            <SelectItem value="three">Three</SelectItem>
          </SelectContent>
        </Select>
      </Specimen>
      <Specimen name="ui-toggle" title="Toggle" source="components/ui/toggle.tsx" variants={["default", "outline", "sm", "lg"]}>
        <Toggle aria-label="bold"><BoldIcon /></Toggle>
        <Toggle variant="outline" aria-label="italic" defaultPressed><ItalicIcon /></Toggle>
        <Toggle size="sm" aria-label="underline"><UnderlineIcon /></Toggle>
        <Toggle size="lg" aria-label="bold large"><BoldIcon /></Toggle>
      </Specimen>
      <Specimen name="ui-toggle-group" title="Toggle group" source="components/ui/toggle-group.tsx">
        <ToggleGroup type="single" defaultValue="italic" variant="outline">
          <ToggleGroupItem value="bold" aria-label="bold"><BoldIcon /></ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="italic"><ItalicIcon /></ToggleGroupItem>
          <ToggleGroupItem value="underline" aria-label="underline"><UnderlineIcon /></ToggleGroupItem>
        </ToggleGroup>
      </Specimen>
      <Specimen name="ui-field" title="Field" source="components/ui/field.tsx" variants={["vertical", "horizontal"]}>
        <FieldGroup className="w-full max-w-sm">
          <Field>
            <FieldLabel htmlFor="lib-field-name">Name</FieldLabel>
            <Input id="lib-field-name" placeholder="Ada Lovelace" />
            <FieldDescription>Shown next to your messages.</FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Switch id="lib-field-notify" />
            <FieldContent>
              <FieldLabel htmlFor="lib-field-notify">Notifications</FieldLabel>
              <FieldDescription>Notify when a run finishes.</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </Specimen>
      <Specimen name="ui-input-group" title="Input group" source="components/ui/input-group.tsx">
        <InputGroup className="w-72">
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput placeholder="Search…" />
          <InputGroupAddon align="inline-end"><InputGroupButton>Go</InputGroupButton></InputGroupAddon>
        </InputGroup>
      </Specimen>
    </>
  );
}
