// @vitest-environment node
import { describe, expect, it } from "vitest";
import { matchOrderForLookup } from "./lookup-order";
import type { Order } from "./types";

function makeOrder(id: string, phone: string): Order {
  return {
    id,
    status: "pending",
    createdAt: "2026-10-21T03:00:00.000Z",
    updatedAt: "2026-10-21T03:00:00.000Z",
    customer: { fullName: "A", phone, address: "x" },
    shippingMethod: "standard",
    paymentMethod: "cod",
    items: [],
    subtotal: 0,
    shippingFee: 0,
    total: 0,
    source: "web",
    statusHistory: [],
    internalNotes: [],
  };
}

const ORDERS = [
  makeOrder("SL-20261021-4F9A2C", "0912345678"),
  makeOrder("SL-20261021-AAAAAA", "+84987654321"),
];

describe("matchOrderForLookup", () => {
  it("khớp Mã đơn và SĐT", () => {
    expect(matchOrderForLookup(ORDERS, "SL-20261021-4F9A2C", "0912345678")).toBe(
      "SL-20261021-4F9A2C",
    );
  });

  it("SĐT +84 và 0 khớp hai chiều", () => {
    expect(matchOrderForLookup(ORDERS, "SL-20261021-4F9A2C", "+84912345678")).toBe(
      "SL-20261021-4F9A2C",
    );
    expect(matchOrderForLookup(ORDERS, "SL-20261021-AAAAAA", "0987654321")).toBe(
      "SL-20261021-AAAAAA",
    );
  });

  it("Mã đơn trim và chữ hoa, trả Mã đơn lưu trong store", () => {
    expect(matchOrderForLookup(ORDERS, " sl-20261021-4f9a2c ", "0912 345 678")).toBe(
      "SL-20261021-4F9A2C",
    );
  });

  it.each([
    ["sai Mã đơn", "SL-20261021-000000", "0912345678"],
    ["sai SĐT", "SL-20261021-4F9A2C", "0912345679"],
    ["SĐT của đơn khác", "SL-20261021-4F9A2C", "0987654321"],
    ["cả hai sai", "SL-X", "0900000000"],
    ["SĐT sai định dạng", "SL-20261021-4F9A2C", "abc"],
    ["SĐT rỗng", "SL-20261021-4F9A2C", ""],
    ["Mã đơn rỗng", "", "0912345678"],
  ])("null khi %s", (_name, id, phone) => {
    expect(matchOrderForLookup(ORDERS, id, phone)).toBeNull();
  });

  it("danh sách rỗng thì null", () => {
    expect(matchOrderForLookup([], "SL-1", "0912345678")).toBeNull();
  });

  it("đơn có SĐT lưu không hợp lệ không bao giờ khớp", () => {
    expect(matchOrderForLookup([makeOrder("SL-1", "bad")], "SL-1", "bad")).toBeNull();
  });
});
