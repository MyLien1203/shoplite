import type { AccessConfig } from "./access-config";
import { verifyToken } from "./signed-token";

export type StaffAccess =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "missing" | "invalid" };

/** Hàm thuần: quyết định quyền nhân viên từ giá trị cookie `sl_staff`, cấu hình và `now` (ms). */
export function checkStaffAccess(
  cookieValue: string | undefined,
  config: AccessConfig,
  now: number,
): StaffAccess {
  if (!config.configured) return { ok: false, reason: "unconfigured" };
  if (!cookieValue) return { ok: false, reason: "missing" };
  const result = verifyToken(cookieValue, config.sessionSecret, "staff", now);
  return result.ok ? { ok: true } : { ok: false, reason: "invalid" };
}
