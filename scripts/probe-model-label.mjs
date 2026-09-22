#!/usr/bin/env node
// Manual confirmation for the model-unknown-on-session-load fix (Step 4 of the plan at
// ~/.notebook/project/gjuoun/pi-web/plan/2026-09-22/model-unknown-on-session-load/plan.md).
//
// This does not inspect the DOM (no per-message label to check headlessly). It verifies the
// *data* the fix depends on — displayModel's inputs — is present at both points in time that
// components/MessageView.tsx's fallbackModel prop relies on:
//   1. A brand-new session, right after its first prompt completes.
//   2. The same session "reopened" (a fresh GET, simulating a page reload).
//
// Usage: node scripts/probe-model-label.mjs [baseUrl] [cwd]
//
// Requires a working model/API key configured for the pi agent (this hits POST
// /api/agent/new with type:"prompt", which needs a real provider to complete the turn).

const baseUrl = process.argv[2] ?? "http://127.0.0.1:30141";
const cwd = process.argv[3] ?? process.cwd();

async function main() {
  // 1. Create a brand-new session and send one prompt.
  const newRes = await fetch(`${baseUrl}/api/agent/new`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cwd,
      type: "prompt",
      message: "Reply with the single word: pong",
    }),
  });
  if (!newRes.ok) {
    throw new Error(`POST /api/agent/new failed: ${newRes.status} ${await newRes.text()}`);
  }
  const newBody = await newRes.json();
  const sessionId = newBody.sessionId ?? newBody.data?.sessionId;
  if (!sessionId) {
    throw new Error(`No sessionId in response: ${JSON.stringify(newBody)}`);
  }

  // Poll GET /api/agent/[id] until the turn settles (running: false or idle), then read the
  // persisted session context via GET /api/sessions/[id].
  const deadline = Date.now() + 30_000;
  let running = true;
  while (running && Date.now() < deadline) {
    const stateRes = await fetch(`${baseUrl}/api/agent/${sessionId}`);
    const state = await stateRes.json();
    running = Boolean(state?.state?.busy ?? state?.state?.running);
    if (running) await new Promise((r) => setTimeout(r, 500));
  }

  const freshRes = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
  if (!freshRes.ok) {
    throw new Error(`GET /api/sessions/${sessionId} failed: ${freshRes.status} ${await freshRes.text()}`);
  }
  const freshBody = await freshRes.json();
  const modelAfterTurn = freshBody?.data?.context?.model ?? freshBody?.context?.model;
  if (!modelAfterTurn?.provider || !modelAfterTurn?.modelId) {
    console.error(`FAIL: context.model missing right after the turn: ${JSON.stringify(modelAfterTurn)}`);
    process.exit(1);
  }
  console.log(`model: ${modelAfterTurn.provider}/${modelAfterTurn.modelId}`);

  // 2. Re-GET the same session id fresh, simulating a reopen.
  const reopenRes = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
  if (!reopenRes.ok) {
    throw new Error(`GET /api/sessions/${sessionId} (reopen) failed: ${reopenRes.status} ${await reopenRes.text()}`);
  }
  const reopenBody = await reopenRes.json();
  const modelOnReopen = reopenBody?.data?.context?.model ?? reopenBody?.context?.model;
  if (!modelOnReopen?.provider || !modelOnReopen?.modelId) {
    console.error(`FAIL: context.model missing on reopen: ${JSON.stringify(modelOnReopen)}`);
    process.exit(1);
  }
  console.log(`model: ${modelOnReopen.provider}/${modelOnReopen.modelId}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
});
