import { describe, expect, it } from "vitest";
import { OrderError } from "./order-errors";
import {
  buildStaffOrderList,
  parseStaffOrderFilter,
  STAFF_ORDER_FILTERS,
} from "./staff-order-list";
import type { Order, OrderStatus } from "./types";

function makeOrder(id: string, status: OrderStatus, createdAt: string): Order {
  return {
    id,
    status,
    createdAt,
    updatedAt: createdAt,
    customer: { fullName: "A", phone: "0356789012", address: "x" },
    shippingMethod: "standard",
    paymentMethod: "cod",
    items: [],
    subtotal: 0,
    shippingFee: 0,
    total: 0,
    source: "web",
    statusHistory: [{ status: "pending", at: createdAt }],
    internalNotes: [],
  };
}

const T = (n: number) => `2026-11-0${n}T00:00:00.000Z`;

const sample = (): Order[] => [
  makeOrder("D", "delivered", T(1)),
  makeOrder("P2", "pending", T(5)),
  makeOrder("S", "shipping", T(3)),
  makeOrder("C", "cancelled", T(2)),
  makeOrder("P1", "pending", T(4)),
  makeOrder("F", "confirmed", T(6)),
];

const ids = (orders: Order[]) => orders.map((o) => o.id);

describe("buildStaffOrderList - lọc", () => {
  it("active: chỉ pending/confirmed/shipping, cũ nhất trước", () => {
    expect(ids(buildStaffOrderList(sample(), "active").orders)).toEqual(["S", "P1", "P2", "F"]);
  });

  it("từng trạng thái chỉ trả đúng trạng thái đó", () => {
    expect(ids(buildStaffOrderList(sample(), "shipping").orders)).toEqual(["S"]);
    expect(ids(buildStaffOrderList(sample(), "pending").orders)).toEqual(["P1", "P2"]);
    expect(ids(buildStaffOrderList(sample(), "confirmed").orders)).toEqual(["F"]);
    expect(ids(buildStaffOrderList(sample(), "delivered").orders)).toEqual(["D"]);
    expect(ids(buildStaffOrderList(sample(), "cancelled").orders)).toEqual(["C"]);
  });

  it("all: mọi đơn kể cả delivered/cancelled, cũ nhất trước", () => {
    expect(ids(buildStaffOrderList(sample(), "all").orders)).toEqual([
      "D",
      "C",
      "S",
      "P1",
      "P2",
      "F",
    ]);
  });
});

describe("buildStaffOrderList - sắp xếp", () => {
  it("cùng createdAt thì theo id tăng dần, mọi hoán vị đầu vào cho cùng kết quả", () => {
    const a = makeOrder("B", "pending", T(1));
    const b = makeOrder("A", "pending", T(1));
    const c = makeOrder("C", "pending", T(1));
    for (const input of [
      [a, b, c],
      [c, b, a],
      [b, c, a],
    ]) {
      expect(ids(buildStaffOrderList(input, "active").orders)).toEqual(["A", "B", "C"]);
    }
  });

  it("không đổi mảng đầu vào", () => {
    const input = sample();
    const snapshot = structuredClone(input);
    buildStaffOrderList(input, "active");
    expect(input).toEqual(snapshot);
  });
});

describe("buildStaffOrderList - counts", () => {
  const expected = {
    active: 4,
    pending: 2,
    confirmed: 1,
    shipping: 1,
    delivered: 1,
    cancelled: 1,
    all: 6,
  };

  it("đếm trên toàn bộ đơn, độc lập bộ lọc", () => {
    for (const filter of STAFF_ORDER_FILTERS) {
      expect(buildStaffOrderList(sample(), filter).counts).toEqual(expected);
    }
  });

  it("store rỗng: orders rỗng, counts toàn 0 đủ bảy khóa", () => {
    const result = buildStaffOrderList([], "active");
    expect(result.orders).toEqual([]);
    expect(result.counts).toEqual({
      active: 0,
      pending: 0,
      confirmed: 0,
      shipping: 0,
      delivered: 0,
      cancelled: 0,
      all: 0,
    });
  });
});

describe("parseStaffOrderFilter", () => {
  it("vắng mặt (mảng rỗng) = active", () => {
    expect(parseStaffOrderFilter([])).toBe("active");
  });

  it("nhận đủ bảy giá trị hợp lệ", () => {
    for (const value of [
      "active",
      "pending",
      "confirmed",
      "shipping",
      "delivered",
      "cancelled",
      "all",
    ]) {
      expect(parseStaffOrderFilter([value])).toBe(value);
    }
  });

  it.each([["foo"], [""], ["Pending"], ["ALL"], [" all"], ["pending,all"]])(
    "từ chối %j bằng VALIDATION_ERROR có details.status",
    (value) => {
      try {
        parseStaffOrderFilter([value]);
        expect.unreachable("phải ném lỗi");
      } catch (error) {
        expect(error).toBeInstanceOf(OrderError);
        const e = error as OrderError;
        expect(e.code).toBe("VALIDATION_ERROR");
        expect(e.httpStatus).toBe(400);
        expect(e.details).toHaveProperty("status");
      }
    },
  );

  it("status lặp hai lần trở lên bị từ chối, kể cả khi cùng giá trị", () => {
    for (const raw of [
      ["pending", "all"],
      ["all", "all"],
      ["active", "pending", "all"],
    ]) {
      expect(() => parseStaffOrderFilter(raw)).toThrow(OrderError);
    }
  });
});
