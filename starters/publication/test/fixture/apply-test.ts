/**
 * Test fixture entrypoint. Targets the wrangler test profile
 * (`--env test --persist-to .wrangler-test`) so its state stays out
 * of the dev profile's `.wrangler/` directory.
 *
 * Seeds the same demo content as the dev fixture PLUS a
 * `staff(u-staff-1, editor)` row that integration smokes
 * (mcp-smoke / view-smoke) depend on — they authenticate as
 * `Authorization: Bearer dev-u-staff-1` and need that user to have
 * editor privileges to exercise role-gated MCP and View paths.
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
