import { spawn } from "node:child_process";
import { once } from "node:events";
import { closeSync, mkdirSync, openSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEEDED_HOME, SEEDED_ROOT } from "../../app/ui/preview/_fixtures/settings.ts";
import { seedAgentDir } from "./seed.mjs";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/**
 * Seed an agent dir from the preview fixtures and start the REAL app on it (own port, TZ=UTC, no
 * password). Needs the dev server on :30141 stopped: Next shares `.next/dev/lock` per checkout.
 * Returns `{ base, activeSessionId, projectDir, agentDir, stop }`.
 */
export async function startRealApp({ mode = process.env.E2E_SERVER_MODE || "dev" } = {}) {
  // The real app shows paths relative to $HOME (`~/code/gjuoun/pi-web`), its file and git routes compare real
  // paths, and the settings screens print absolute paths: so everything lives under one fixed, real-path HOME
  // that the fixtures name literally (see SEEDED_ROOT). One app at a time: the directory is recreated here.
  if (realpathSync("/tmp") !== "/private/tmp") throw new Error("the parity fixtures assume macOS, where /tmp is /private/tmp");
  rmSync(SEEDED_ROOT, { recursive: true, force: true });
  const home = SEEDED_HOME;
  const agentDir = join(home, ".pi", "agent");
  mkdirSync(agentDir, { recursive: true });
  const seeded = seedAgentDir(agentDir, { projectsRoot: join(home, "code", "gjuoun") });
  // PARITY_SERVER_LOG=<file> keeps the real app's output for debugging a seed that does not render.
  const logFd = process.env.PARITY_SERVER_LOG ? openSync(process.env.PARITY_SERVER_LOG, "w") : "ignore";
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), mode, "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, HOME: home, PI_CODING_AGENT_DIR: agentDir, PI_WEB_PASSWORD: "", TZ: "UTC", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", logFd, logFd],
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${base}/api/sessions`)).ok) break; } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (i === 119) { server.kill("SIGTERM"); throw new Error("the real app did not start"); }
  }
  // Warm the routes the first page load needs: a cold Next dev server compiles each one on first use and
  // the UI keeps whatever error that first, slow request produced.
  const cwd = encodeURIComponent(seeded.projectDir);
  for (const path of [`/api/models?cwd=${cwd}`, `/api/git/status?cwd=${cwd}`, "/api/home", "/api/sessions", "/api/app-update", "/api/skills", "/api/plugins"]) {
    await fetch(`${base}${path}`).catch(() => {});
  }
  return {
    base,
    agentDir,
    home,
    ...seeded,
    stop: async () => { if (typeof logFd === "number") closeSync(logFd); server.kill("SIGTERM"); await once(server, "exit").catch(() => {}); rmSync(SEEDED_ROOT, { recursive: true, force: true }); },
  };
}
