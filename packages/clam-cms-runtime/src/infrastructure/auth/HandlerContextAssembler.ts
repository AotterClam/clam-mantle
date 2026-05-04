import type { HandlerContext } from "../../domain/model/HandlerContext.js";
import type { DatabaseDriver } from "../../domain/port/DatabaseDriver.js";
import type { SessionRepository } from "../../domain/port/SessionRepository.js";
import { readActiveSession } from "./SessionResolver.js";
import { readStaff } from "./StaffReader.js";

/**
 * Assemble a `HandlerContext` from the request:
 *   - `user`  is filled when a valid cookie session resolves to a row.
 *   - `staff` is filled when that user also has a `staff` overlay.
 *
 * Anonymous requests yield `{ user: null, staff: null }`. Adapter
 * passes its native `env` (CF Worker bindings on Cloudflare) through
 * opaquely — handlers cast as needed; runtime never inspects.
 */
export interface AssembleHandlerContextArgs {
  readonly req: Request;
  readonly db: DatabaseDriver;
  readonly sessions: SessionRepository;
  readonly env: unknown;
  readonly waitUntil?: (p: Promise<unknown>) => void;
  readonly cookieName?: string;
  readonly now?: () => number;
}

export async function assembleHandlerContext(
  args: AssembleHandlerContextArgs,
): Promise<HandlerContext> {
  const session = await readActiveSession({
    req: args.req,
    sessions: args.sessions,
    cookieName: args.cookieName,
    now: args.now,
  });
  if (!session) {
    return { user: null, staff: null, env: args.env, waitUntil: args.waitUntil };
  }
  const staff = await readStaff(args.db, session.userId);
  return {
    user: { id: session.userId },
    staff: staff ? { id: staff.userId, role: staff.role } : null,
    env: args.env,
    waitUntil: args.waitUntil,
  };
}
