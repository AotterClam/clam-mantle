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
  readonly email: string;
  readonly name: string | null;
  readonly createdAt: number;
}
