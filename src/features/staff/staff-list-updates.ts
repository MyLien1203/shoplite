import type { OrderListCounts, StaffOrderFilter } from "@/features/orders/staff-order-list";
import type { OrderStatus } from "@/features/orders/types";

const ACTIVE_STATUSES: readonly OrderStatus[] = ["pending", "confirmed", "shipping"];

/** Đơn có trạng thái `status` còn thuộc bộ lọc `filter` không (khớp quy tắc của API danh sách). */
export function matchesFilter(status: OrderStatus, filter: StaffOrderFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return ACTIVE_STATUSES.includes(status);
  return status === filter;
}

function adjust(
  counts: Partial<OrderListCounts>,
  key: keyof OrderListCounts,
  delta: number,
): Partial<OrderListCounts> {
  const current = counts[key];
  if (typeof current !== "number" || !Number.isFinite(current)) return counts;
  return { ...counts, [key]: Math.max(0, current + delta) };
}

/**
 * Cập nhật số đếm cục bộ khi một đơn chuyển `from` -> `to`. Chỉ chỉnh các khóa đang có số hữu hạn,
 * không bao giờ âm; `all` không đổi. Hàm thuần.
 */
export function applyTransitionToCounts(
  counts: Partial<OrderListCounts>,
  from: OrderStatus,
  to: OrderStatus,
): Partial<OrderListCounts> {
  if (from === to) return counts;
  let next = adjust(counts, from, -1);
  next = adjust(next, to, 1);
  const wasActive = ACTIVE_STATUSES.includes(from);
  const isActive = ACTIVE_STATUSES.includes(to);
  if (wasActive && !isActive) next = adjust(next, "active", -1);
  else if (!wasActive && isActive) next = adjust(next, "active", 1);
  return next;
}
