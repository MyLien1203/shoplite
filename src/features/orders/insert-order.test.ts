import { describe, expect, it } from "vitest";
import { createEmptyStore } from "@/features/store/store-types";
import { insertOrder } from "./insert-order";
import type { Order } from "./types";

function makeOrder(id: string): Order {
  return {
    id,
    status: "pending",
    createdAt: "2026-10-21T03:00:00.000Z",
    updatedAt: "2026-10-21T03:00:00.000Z",
    customer: { fullName: "A", phone: "0987654321", address: "x" },
    shippingMethod: "standard",
    paymentMethod: "cod",
    items: [],
    subtotal: 0,
    shippingFee: 0,
    total: 0,
    source: "web",
    statusHistory: [{ status: "pending", at: "2026-10-21T03:00:00.000Z" }],
    internalNotes: [],
  };
}

describe("insertOrder", () => {
  it("thêm đơn mới, giữ id, không đổi đầu vào", () => {
    const data = createEmptyStore();
    const result = insertOrder(data, makeOrder("A"), () => "X");
    expect(result.order.id).toBe("A");
    expect(result.data.orders).toHaveLength(1);
    expect(data.orders).toHaveLength(0);
  });

  it("id trùng thì sinh lại từ createdAt, đơn cũ nguyên", () => {
    const data = { ...createEmptyStore(), orders: [makeOrder("A")] };
    const dates: Date[] = [];
    const result = insertOrder(data, makeOrder("A"), (d) => {
      dates.push(d);
      return "B";
    });
    expect(result.order.id).toBe("B");
    expect(result.data.orders.map((o) => o.id)).toEqual(["A", "B"]);
    expect(dates[0].toISOString()).toBe("2026-10-21T03:00:00.000Z");
  });

  it("quá 10 lần sinh lại thì ném lỗi", () => {
    const data = { ...createEmptyStore(), orders: [makeOrder("A")] };
    let calls = 0;
    expect(() =>
      insertOrder(data, makeOrder("A"), () => {
        calls++;
        return "A";
      }),
    ).toThrow("Không sinh được Mã đơn");
    expect(calls).toBe(10);
  });
});
