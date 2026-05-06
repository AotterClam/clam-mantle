#!/usr/bin/env node
/**
 * Integration test orchestrator. Runs the test profile end-to-end:
 *
 *   1. Spawn `wrangler dev --env test --persist-to .wrangler-test`
 *      (port 8788; profile from wrangler.toml [env.test]).
 *   2. Wait for "Ready on" in stderr/stdout.
 *   3. Apply the test fixture (apply-test.ts) — seeds posts/pages
 *      plus the `staff(u-staff-1, editor)` row mcp-smoke needs.
 *   4. Run integration smokes against http://localhost:8788.
 *   5. Tear down the wrangler process.
 *
 * Bypasses `wrangler unstable_dev()` deliberately — it would force
 * miniflare into the same Node process as the test runner, and we
 * lose CLI parity with `pnpm dev`. The price is one stdio pipe and a
 * SIGTERM on exit, which is fine.
 *
 * Exit code: bubbled up from the first failing smoke (or 0 if all
 * pass). Wrangler's own exit code is informational only.
 */
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PORT = 8788;
const BASE_URL = `http://localhost:${PORT}`;
const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

function log(msg) {
  process.stderr.write(`[run-integration] ${msg}\n`);
}

async function waitForReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/`, {
        signal: AbortSignal.timeout(2_000),
      });
      // Any HTTP response — even a 404 — means the worker is up.
      if (res.status >= 200 && res.status < 600) return;
    } catch {
      /* not yet listening */
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(
    `wrangler did not become ready on ${BASE_URL} within ${READY_TIMEOUT_MS}ms`,
  );
}

function runStep(label, command, args, env = {}) {
  log(`step: ${label}`);
  execFileSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

async function main() {
  log(`starting wrangler test profile on ${BASE_URL}`);
  const wrangler = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--env=test",
      "--persist-to=.wrangler-test",
      `--port=${PORT}`,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );

  let exited = false;
  wrangler.on("exit", (code) => {
    exited = true;
    log(`wrangler exited (code=${code})`);
  });

  const cleanup = () => {
    if (!exited && !wrangler.killed) {
      log("stopping wrangler");
      wrangler.kill("SIGTERM");
    }
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    await waitForReady();
    log(`wrangler ready on ${BASE_URL}`);

    runStep(
      "apply test fixture",
      "pnpm",
      ["exec", "tsx", "test/fixture/apply-test.ts"],
    );
    runStep(
      "mcp-smoke",
      "pnpm",
      ["exec", "tsx", "test/integration/mcp-smoke.ts"],
      { WRANGLER_BASE_URL: BASE_URL },
    );
    runStep(
      "view-smoke",
      "pnpm",
      ["exec", "tsx", "test/integration/view-rest-smoke.ts"],
      { WRANGLER_BASE_URL: BASE_URL },
    );

    log("all smokes passed");
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  log(`integration failed: ${err.message}`);
  process.exit(1);
});
