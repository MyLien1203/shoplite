// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "./types";

const STORE_KEY = Symbol.for("shoplite.store");

const input = {
  customer: {
    fullName: "Trần Thị B",
    phone: "0987654321",
    address: "45 Lê Lợi, Hải Châu, Đà Nẵng",
  },
  shippingMethod: "standard",
  paymentMethod: "cod",
  items: [{ productId: "p010", quantity: 1 }],
};

describe("orders/server (nối store lười)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "shoplite-orders-server-"));
    vi.stubEnv("STORE_FILE", path.join(dir, "store.json"));
    vi.stubEnv("ORDERS_FILE", path.join(dir, "orders.json"));
    delete (globalThis as Record<symbol, unknown>)[STORE_KEY];
    vi.resetModules();
  });

  afterEach(async () => {
    delete (globalThis as Record<symbol, unknown>)[STORE_KEY];
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  it("import không tạo gateway và không tạo file", async () => {
    await import("./server");
    expect((globalThis as Record<symbol, unknown>)[STORE_KEY]).toBeUndefined();
    expect(existsSync(path.join(dir, "store.json"))).toBe(false);
    expect(existsSync(path.join(dir, "orders.json"))).toBe(false);
  });

  it("placeOrder ghi vào store.json và đọc lại đúng đơn", async () => {
    const { orderService } = await import("./server");
    const placed = await orderService.placeOrder(input);

    expect((await orderService.listOrders()).map((o) => o.id)).toEqual([placed.id]);
    expect(await orderService.getOrder(placed.id)).toEqual(placed);

    const saved = JSON.parse(await readFile(path.join(dir, "store.json"), "utf8")) as {
      orders: Order[];
    };
    expect(saved.orders.map((o) => o.id)).toEqual([placed.id]);
    expect(existsSync(path.join(dir, "orders.json"))).toBe(false);
  });
});
