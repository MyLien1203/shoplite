import type { OrderListCounts, StaffOrderFilter } from "@/features/orders/staff-order-list";
import type { Order } from "@/features/orders/types";

export type LoadStaffOrdersResult =
  | { kind: "ok"; orders: Order[]; counts: OrderListCounts }
  | { kind: "unauthorized" }
  | { kind: "error" };

/**
 * Tải danh sách đơn cho nhân viên. Trả `null` khi bị hủy (AbortError) để nơi gọi bỏ qua im lặng.
 */
export async function loadStaffOrders(
  filter: StaffOrderFilter,
  signal?: AbortSignal,
): Promise<LoadStaffOrdersResult | null> {
  try {
    const res = await fetch(`/api/orders?status=${filter}`, { cache: "no-store", signal });
    if (res.status === 401) return { kind: "unauthorized" };
    if (!res.ok) return { kind: "error" };
    const body: unknown = await res.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("orders" in body) ||
      !Array.isArray(body.orders)
    ) {
      return { kind: "error" };
    }
    const counts = ("counts" in body ? body.counts : {}) as OrderListCounts;
    return { kind: "ok", orders: body.orders as Order[], counts };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    return { kind: "error" };
  }
}
