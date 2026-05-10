/**
 * Test fixture entrypoint. Targets the wrangler test profile
 * (`--env test --persist-to .wrangler-test`) so its state stays out
 * of the dev profile's `.wrangler/` directory.
 *
 * Seeds the same demo content as the dev fixture PLUS
 * `user(u-staff-1, role=editor)` and a Better Auth MCP access token
 * with `mcp:staff` scope so integration smokes can exercise
 * role-gated Staff MCP paths.
 *
 * Called by `pnpm test:integration` (via globalSetup), not normally
 * invoked by humans.
 */
import { applyFixture } from "./apply-shared.js";

async function main(): Promise<void> {
  await applyFixture({
    seedStaffEditor: true,
    wranglerEnv: "test",
    persistTo: ".wrangler-test",
    artefactPrefix: "test",
  });
}

main();
