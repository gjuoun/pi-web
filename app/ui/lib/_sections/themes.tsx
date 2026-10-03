import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { THEMES } from "@/lib/themes";
import { Section } from "../_showcase/section";
import { Specimen } from "../_showcase/specimen";
import { ThemeScope } from "../_showcase/theme-scope";

/** The same sample, rendered once per registry theme, each inside its own scope. */
export function ThemesSection() {
  return (
    <Section id="themes" title="Themes" description="Each theme is a block of the raw shadcn variables in app/globals.css (lib/themes.ts is the registry). The same parts render here in every theme, whatever theme the page itself is in.">
      {THEMES.map(({ id, label, dark }) => (
        <Specimen key={id} name={`theme-${id}`} title={label} source={id === "default" ? ":root" : `[data-theme="${id}"]`} variants={[dark ? "dark" : "light"]}>
          <ThemeScope theme={id} className="flex w-full flex-col gap-4 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Badge>Badge</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Input className="w-56" placeholder="Input" />
              <Switch defaultChecked />
              <Checkbox defaultChecked />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Card</CardTitle>
                  <CardDescription>Muted supporting text.</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-success">Success</span> · <span className="text-warning">Warning</span> · <span className="text-destructive">Destructive</span>
                </CardContent>
              </Card>
              <Alert>
                <InfoIcon />
                <AlertTitle>Alert</AlertTitle>
                <AlertDescription>Neutral message.</AlertDescription>
              </Alert>
            </div>
          </ThemeScope>
        </Specimen>
      ))}
    </Section>
  );
}
