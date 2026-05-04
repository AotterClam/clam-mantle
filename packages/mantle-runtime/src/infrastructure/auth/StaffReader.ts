import { isStaffRole, type StaffRole } from "@aotter/mantle-spec";
import type { DatabaseDriver } from "../../domain/port/DatabaseDriver.js";
import type {
  Staff,
  StaffMembership,
} from "../../domain/model/Staff.js";

/**
 * Read the `staff` row for a given user, or `null` if the user has no
 * privilege overlay. Used by the `HandlerContextAssembler` when
 * building `HandlerContext.staff` — anonymous and regular-member
 * callers see `staff: null`.
 */
export async function readStaff(
  db: DatabaseDriver,
  userId: string,
): Promise<Staff | null> {
  const row = await db
    .prepare(
      `SELECT user_id, role, granted_by, granted_at FROM staff WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{
      user_id: string;
      role: string;
      granted_by: string | null;
      granted_at: number;
    }>();
  if (!row) return null;
  if (!isStaffRole(row.role)) return null;
  return {
    userId: row.user_id,
    role: row.role,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
  };
}

/**
 * Read the staff row joined with the user row, for admin-UI callers
 * that need email/name on top of the role.
 */
export async function readStaffMembership(
  db: DatabaseDriver,
  userId: string,
): Promise<StaffMembership | null> {
  const row = await db
    .prepare(
      `SELECT s.user_id, s.role, u.email, u.name
       FROM staff s INNER JOIN users u ON u.id = s.user_id
       WHERE s.user_id = ?`,
    )
    .bind(userId)
    .first<{
      user_id: string;
      role: string;
      email: string;
      name: string | null;
    }>();
  if (!row) return null;
  if (!isStaffRole(row.role)) return null;
  return {
    userId: row.user_id,
    role: row.role as StaffRole,
    email: row.email,
    name: row.name,
  };
}
