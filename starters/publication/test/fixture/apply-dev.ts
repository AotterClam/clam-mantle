/**
 * Dev fixture entrypoint. Run via `pnpm fixture` before `pnpm dev`.
 *
 * Seeds the demo posts/pages so the admin SPA has content on first
 * boot. Does NOT seed the staff table — `ensureBootstrapOwner` must
 * fire for the operator's first GitHub OAuth login. See issue #43
 * for why staff seeding is excluded from the dev fixture.
 */
import { applyFixture } from "./apply-shared.js";

async function main(): Promise<void> {
  await applyFixture({
    seedStaffEditor: false,
    artefactPrefix: "dev",
  });

  process.stdout.write("\nNext:\n");
  process.stdout.write("  pnpm dev\n");
  process.stdout.write("  open http://localhost:8787\n");
  process.stdout.write("  open http://localhost:8787/admin\n");
}

main();
