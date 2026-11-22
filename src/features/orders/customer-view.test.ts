import { describe, expect, expectTypeOf, it } from "vitest";
import { toCustomerView } from "./customer-view";
import type { CustomerOrderView, Order } from "./types";

const order: Order = {
  id: "SL-20261021-AAAAAA",
  status: "pending",
  createdAt: "2026-10-21T00:00:00.000Z",
  updatedAt: "2026-10-21T00:00:00.000Z",
  customer: { fullName: "A", phone: "0912345678", address: "x" },
  shippingMethod: "standard",
  paymentMethod: "cod",
  items: [],
  subtotal: 0,
  shippingFee: 0,
  total: 0,
  source: "web",
  statusHistory: [{ status: "pending", at: "2026-10-21T00:00:00.000Z" }],
  trackingCode: "T1",
  expectedDeliveryDate: "2026-10-25",
  internalNotes: [{ id: "n1", text: "khách khó tính", createdAt: "2026-10-21T00:00:00.000Z" }],
};

describe("toCustomerView", () => {
  it("không có khóa internalNotes", () => {
    const view = toCustomerView(order);
    expect("internalNotes" in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain("khách khó tính");
  });

  it("tập khóa còn lại đúng bằng Order trừ internalNotes", () => {
    expect(Object.keys(toCustomerView(order)).sort()).toEqual(
      [
        "id",
        "status",
        "createdAt",
        "updatedAt",
        "customer",
        "shippingMethod",
        "paymentMethod",
        "items",
        "subtotal",
        "shippingFee",
        "total",
        "source",
        "statusHistory",
        "trackingCode",
        "expectedDeliveryDate",
      ].sort(),
    );
  });

  it("không đổi đơn gốc", () => {
    toCustomerView(order);
    expect(order.internalNotes).toHaveLength(1);
  });
});

describe("CustomerOrderView (kiểu)", () => {
  it("không có khóa internalNotes ở mức kiểu", () => {
    expectTypeOf<CustomerOrderView>().not.toHaveProperty("internalNotes");
    expectTypeOf<Order>().toHaveProperty("internalNotes");
    expectTypeOf(toCustomerView).returns.toEqualTypeOf<CustomerOrderView>();
  });
});
