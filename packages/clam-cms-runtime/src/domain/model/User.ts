/**
 * `User` — base identity row. Lives in runtime (not spec) because it's
 * a runtime fact: the dispatcher fills `HandlerContext.user` from a
 * row in this table. Spec functions never reference `User`; manifests
 * cite `ctx.user` as a closed-enum auth predicate, not the row shape.
 *
 * Created during sign-in (OAuth callback); a regular site member who
 * has no `staff` overlay sits in this table alone.
 */
export interface User {
  readonly id: string;
  readonly email: string | null;
  readonly name: string | null;
  /** GitHub numeric id. Set after migration 0002; null for users seeded before. */
  readonly githubId: number | null;
  /** GitHub login handle. Updated on every sign-in to track renames. */
  readonly githubLogin: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}
