import { describe, expect, it } from "vitest";
import { STAFF_ORDER_FILTERS, type OrderListCounts } from "@/features/orders/staff-order-list";
import { ORDER_STATUSES, type OrderStatus } from "@/features/orders/types";
import { applyTransitionToCounts, matchesFilter } from "./staff-list-updates";

describe("matchesFilter", () => {
  it.each(
    STAFF_ORDER_FILTERS.flatMap((filter) =>
      ORDER_STATUSES.map((status) => [filter, status] as const),
    ),
  )("bộ lọc %s x trạng thái %s", (filter, status) => {
    const expected =
      filter === "all"
        ? true
        : filter === "active"
          ? ["pending", "confirmed", "shipping"].includes(status)
          : filter === status;
    expect(matchesFilter(status, filter)).toBe(expected);
  });
});

const base: OrderListCounts = {
  active: 3,
  pending: 1,
  confirmed: 1,
  shipping: 1,
  delivered: 4,
  cancelled: 2,
  all: 10,
};

describe("applyTransitionToCounts", () => {
  it("pending -> confirmed: active giữ nguyên, hai trạng thái đổi", () => {
    expect(applyTransitionToCounts(base, "pending", "confirmed")).toEqual({
      ...base,
      pending: 0,
      confirmed: 2,
    });
  });

  it("confirmed -> shipping: active giữ nguyên, hai trạng thái đổi", () => {
    expect(applyTransitionToCounts(base, "confirmed", "shipping")).toEqual({
      ...base,
      confirmed: 0,
      shipping: 2,
    });
  });

  it("shipping -> delivered: active giảm, delivered tăng, all giữ", () => {
    expect(applyTransitionToCounts(base, "shipping", "delivered")).toEqual({
      ...base,
      active: 2,
      shipping: 0,
      delivered: 5,
    });
  });

  it("từ không-active sang active thì active tăng", () => {
    expect(applyTransitionToCounts(base, "cancelled", "pending").active).toBe(4);
  });

  it("cùng trạng thái: không đổi, không đổi đối tượng đầu vào", () => {
    const frozen = Object.freeze({ ...base });
    expect(applyTransitionToCounts(frozen, "pending", "pending")).toEqual(base);
  });

  it("không bao giờ âm", () => {
    const zero = { ...base, pending: 0, active: 0 };
    const next = applyTransitionToCounts(zero, "pending", "delivered");
    expect(Object.values(next).every((v) => (v as number) >= 0)).toBe(true);
    expect(next.active).toBe(0);
  });

  it("counts rỗng hoặc thiếu khóa: không tạo NaN/undefined", () => {
    expect(applyTransitionToCounts({}, "pending", "confirmed")).toEqual({});
    expect(applyTransitionToCounts({ active: 2 }, "shipping", "delivered")).toEqual({ active: 1 });
  });

  it("mọi cặp trạng thái giữ tổng active = pending + confirmed + shipping", () => {
    for (const from of ORDER_STATUSES as readonly OrderStatus[]) {
      for (const to of ORDER_STATUSES as readonly OrderStatus[]) {
        const n = applyTransitionToCounts(base, from, to) as OrderListCounts;
        expect(n.active).toBe(n.pending + n.confirmed + n.shipping);
      }
    }
  });
});

describe("hủy đơn Chờ xác nhận (2.12)", () => {
  it("cancelled không còn khớp bộ lọc Cần xử lý, vẫn khớp Tất cả và Đã hủy", () => {
    expect(matchesFilter("cancelled", "active")).toBe(false);
    expect(matchesFilter("cancelled", "all")).toBe(true);
    expect(matchesFilter("cancelled", "cancelled")).toBe(true);
  });

  it("pending -> cancelled: active -1, pending -1, cancelled +1, all giữ", () => {
    expect(applyTransitionToCounts(base, "pending", "cancelled")).toEqual({
      ...base,
      active: 2,
      pending: 0,
      cancelled: 3,
    });
  });
});
