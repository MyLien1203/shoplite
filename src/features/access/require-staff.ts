import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OrderError } from "@/features/orders/order-errors";
import { getAccessConfig } from "./server";
import { checkStaffAccess, type StaffAccess } from "./staff-access";

async function readStaffAccess(): Promise<StaffAccess> {
  const store = await cookies();
  return checkStaffAccess(
    store.get("sl_staff")?.value,
    getAccessConfig(),
    Date.now(),
  );
}

/** Dùng trong trang: chưa có phiên thì chuyển hướng tới đăng nhập. */
export async function requireStaffPage(): Promise<void> {
  const access = await readStaffAccess();
  if (access.ok) return;
  redirect(
    access.reason === "invalid" ? "/staff/login?expired=1" : "/staff/login",
  );
}

/** Dùng trong API: chưa có phiên thì ném OrderError("UNAUTHORIZED") (401). */
export async function requireStaffApi(): Promise<void> {
  const access = await readStaffAccess();
  if (access.ok) return;
  throw new OrderError(
    "UNAUTHORIZED",
    "Bạn cần đăng nhập để thực hiện thao tác này",
  );
}
