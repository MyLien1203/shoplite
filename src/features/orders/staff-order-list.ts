import { OrderError } from "./order-errors";
import { ORDER_STATUSES, type Order, type OrderStatus } from "./types";

/** Bộ lọc danh sách đơn của nhân viên: `active` = đơn cần xử lý, `all` = mọi đơn (AD-4.6). */
export const STAFF_ORDER_FILTERS = ["active", ...ORDER_STATUSES, "all"] as const;

export type StaffOrderFilter = (typeof STAFF_ORDER_FILTERS)[number];

export type OrderListCounts = Record<StaffOrderFilter, number>;

const ACTIVE_STATUSES: readonly OrderStatus[] = ["pending", "confirmed", "shipping"];

function isStaffOrderFilter(value: string): value is StaffOrderFilter {
  return (STAFF_ORDER_FILTERS as readonly string[]).includes(value);
}

/**
 * Phân tích giá trị `status` của query: rỗng (vắng mặt) = `active`; đúng một giá trị hợp lệ
 * (phân biệt hoa thường) thì dùng; còn lại (lạ, chuỗi rỗng, lặp từ hai lần) là VALIDATION_ERROR.
 */
export function parseStaffOrderFilter(raw: string[]): StaffOrderFilter {
  if (raw.length === 0) return "active";
  const message = `Tham số status phải là một trong: ${STAFF_ORDER_FILTERS.join(", ")}`;
  if (raw.length > 1) {
    throw new OrderError("VALIDATION_ERROR", message, { status: "Chỉ được truyền status một lần" });
  }
  const value = raw[0];
  if (!isStaffOrderFilter(value)) {
    throw new OrderError("VALIDATION_ERROR", message, { status: message });
  }
  return value;
}

function matches(order: Order, filter: StaffOrderFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return ACTIVE_STATUSES.includes(order.status);
  return order.status === filter;
}

function compareOldestFirst(a: Order, b: Order): number {
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Lọc, sắp (createdAt tăng dần, hòa theo id) và đếm. `counts` tính trên toàn bộ `orders`,
 * không phụ thuộc `filter`. Hàm thuần: không đổi mảng đầu vào.
 */
export function buildStaffOrderList(
  orders: Order[],
  filter: StaffOrderFilter,
): { orders: Order[]; counts: OrderListCounts } {
  const counts: OrderListCounts = {
    active: 0,
    pending: 0,
    confirmed: 0,
    shipping: 0,
    delivered: 0,
    cancelled: 0,
    all: orders.length,
  };
  for (const order of orders) {
    counts[order.status] += 1;
    if (ACTIVE_STATUSES.includes(order.status)) counts.active += 1;
  }
  return {
    orders: orders.filter((order) => matches(order, filter)).sort(compareOldestFirst),
    counts,
  };
}
