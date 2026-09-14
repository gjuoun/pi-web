import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  parseAtsutilFamilies,
  parseFontconfigList,
  parseWindowsFamilies,
  toInstalledFonts,
  type FontEnumerationSource,
  type InstalledFont,
} from "@/lib/fonts-installed";
import { isApiRequestAllowed } from "@/lib/request-security";

/**
 * The fonts installed on the machine that runs this server.
 *
 * pi-web is a local app — the server and the browser share one machine — so the OS is a better source
 * than the browser: `atsutil fonts -list` answers in 0.13 s with all 244 families here, needs no
 * permission, and works for Safari and Firefox users, where `queryLocalFonts()` does not exist.
 *
 * Classification comes from the OS where it is trustworthy (`traitMonoSpace` via CoreText, fontconfig's
 * `spacing`) and is refined in the browser for Windows, which exposes no spacing at all.
 *
 * Only names leave this route: no paths, no PostScript names, no raw command output. Commands are fixed
 * argv through `execFile` — never a shell string, never a request-derived argument.
 */

export const dynamic = "force-dynamic";

const run = promisify(execFile);
const MAX_BUFFER = 8 << 20;
const COMMAND_TIMEOUT_MS = 15_000;
/** Fonts change when the user installs one, not per request. */
const CACHE_TTL_MS = 60 * 60 * 1000;

interface FontEnumeration {
  fonts: InstalledFont[];
  source: FontEnumerationSource;
}

let cache: (FontEnumeration & { at: number }) | null = null;

/** macOS: families from `atsutil` (fast, complete), monospace from the CoreText probe. */
async function enumerateMacOS(): Promise<FontEnumeration> {
  const { stdout } = await run("/usr/bin/atsutil", ["fonts", "-list"], { timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_BUFFER });
  const families = parseAtsutilFamilies(stdout);
  let monoFamilies: string[] = [];
  try {
    const probe = new URL("./coretext-probe.swift", import.meta.url).pathname;
    const { stdout: probeOut } = await run("/usr/bin/swift", [probe], { timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_BUFFER });
    monoFamilies = (JSON.parse(probeOut) as InstalledFont[]).filter((font) => font.mono).map((font) => font.family);
  } catch {
    // No Swift toolchain (Command Line Tools missing): keep the names, let the browser probe classify.
  }
  const mono = new Set(monoFamilies);
  return {
    fonts: toInstalledFonts(families.map((family) => ({ family, mono: mono.has(family) }))),
    source: "coretext",
  };
}

async function enumerateLinux(): Promise<FontEnumeration> {
  const { stdout } = await run("fc-list", ["--format=%{family[0]}\t%{spacing}\n"], { timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_BUFFER });
  return { fonts: toInstalledFonts(parseFontconfigList(stdout)), source: "fontconfig" };
}

async function enumerateWindows(): Promise<FontEnumeration> {
  const { stdout } = await run(
    "powershell",
    ["-NoProfile", "-Command", "Add-Type -AssemblyName PresentationCore; [Windows.Media.Fonts]::SystemFontFamilies | ForEach-Object { $_.Source }"],
    { timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_BUFFER },
  );
  return { fonts: toInstalledFonts(parseWindowsFamilies(stdout)), source: "windows" };
}

function enumerator(): (() => Promise<FontEnumeration>) | null {
  if (process.platform === "darwin") return enumerateMacOS;
  if (process.platform === "linux") return enumerateLinux;
  if (process.platform === "win32") return enumerateWindows;
  return null;
}

export async function GET(request: Request) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }

  if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
    const enumerate = enumerator();
    const result = enumerate ? await enumerate().catch(() => null) : null;
    cache = { at: Date.now(), fonts: result?.fonts ?? [], source: result?.source ?? "unavailable" };
  }

  return NextResponse.json(
    { fonts: cache.fonts, source: cache.source },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
