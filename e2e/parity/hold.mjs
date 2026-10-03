/**
 * Start the seeded real app and keep it running, so `run.mjs --reuse` can iterate in seconds instead
 * of paying for a cold Next dev start each time.
 *   tmux new-session -d -s parity-hold 'node e2e/parity/hold.mjs'      (dev server on :30141 must be stopped)
 *   node e2e/parity/run.mjs --reuse --region sidebar
 *   tmux kill-session -t parity-hold                                    (stops it and deletes the temp HOME)
 */
import { writeFileSync } from "node:fs";
import { startRealApp } from "./server.mjs";

const file = process.env.PARITY_HOLD_FILE || "/tmp/jun/ui-parity/hold.json";
const app = await startRealApp();
writeFileSync(file, JSON.stringify({ base: app.base, activeSessionId: app.activeSessionId, projectDir: app.projectDir }));
console.log(`holding ${app.base} (${file})`);
const stop = async () => { await app.stop(); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
setInterval(() => {}, 1 << 30);
