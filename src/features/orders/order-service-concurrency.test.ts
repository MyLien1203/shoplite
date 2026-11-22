// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleRouteError } from "@/lib/http";
import { createJsonFileStoreGateway } from "@/features/store/json-file-store";
import { StoreError } from "@/features/store/store-types";
import { OrderError } from "./order-errors";
import { createOrderService } from "./order-service";
import type { Order } from "./types";

const FIXED_DATE = new Date("2026-10-21T03:00:00.000Z");

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

describe("placeOrder đồng thời trên store JSON thật", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "shoplite-order-conc-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("giữ cả hai đơn, Mã đơn khác nhau dù generateId ép trùng", async () => {
    const file = path.join(dir, "store.json");
    const store = createJsonFileStoreGateway(file);
    const sequence = ["SL-20261021-AAAAAA", "SL-20261021-AAAAAA", "SL-20261021-BBBBBB"];
    const service = createOrderService({
      store,
      now: () => FIXED_DATE,
      generateId: () => sequence.shift() ?? "SL-20261021-CCCCCC",
    });

    const [a, b] = await Promise.all([service.placeOrder(input), service.placeOrder(input)]);

    expect(a.id).not.toBe(b.id);
    const saved = JSON.parse(await readFile(file, "utf8")) as {
      orders: Order[];
    };
    expect(saved.orders.map((o) => o.id).sort()).toEqual([a.id, b.id].sort());
    for (const order of saved.orders) {
      expect(order.id).toMatch(/^SL-\d{8}-[0-9A-Z]{6}$/);
    }
  });

  it("hai đơn đồng thời cho sản phẩm tồn 1: tồn không bị trừ nên cả hai đều được lưu", async () => {
    const file = path.join(dir, "store.json");
    const store = createJsonFileStoreGateway(file);
    await store.update((data) => ({
      data: { ...data, inventory: { p010: 1 } },
      result: undefined,
    }));
    const service = createOrderService({ store, now: () => FIXED_DATE });

    const results = await Promise.allSettled([
      service.placeOrder(input),
      service.placeOrder(input),
    ]);

    // Spec 1.11: tồn KHÔNG bị trừ lúc đặt (Epic 2 mới trừ), nên không đơn nào hết tồn.
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const saved = JSON.parse(await readFile(file, "utf8")) as {
      orders: Order[];
      inventory: Record<string, number>;
    };
    expect(saved.orders).toHaveLength(2);
    expect(saved.inventory).toEqual({ p010: 1 });
  });

  it("store.json hỏng: placeOrder ném CORRUPT_STORE, file nguyên byte, route trả 500", async () => {
    const file = path.join(dir, "store.json");
    const corrupt = "{ not json";
    await writeFile(file, corrupt, "utf8");
    const service = createOrderService({
      store: createJsonFileStoreGateway(file),
      now: () => FIXED_DATE,
    });

    const error = await service.placeOrder(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(StoreError);
    expect(error).not.toBeInstanceOf(OrderError);
    expect((error as StoreError).code).toBe("CORRUPT_STORE");
    expect(await readFile(file, "utf8")).toBe(corrupt);
    expect((await readdir(dir)).sort()).toEqual(["store.json"]);

    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = handleRouteError(error);
    spy.mockRestore();
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
  });

  it("đơn vượt tồn bị từ chối và không ghi gì trên JSON store thật", async () => {
    const file = path.join(dir, "store.json");
    const store = createJsonFileStoreGateway(file);
    await store.update((data) => ({
      data: { ...data, inventory: { p010: 1 } },
      result: undefined,
    }));
    const service = createOrderService({ store, now: () => FIXED_DATE });
    const big = { ...input, items: [{ productId: "p010", quantity: 2 }] };

    const results = await Promise.allSettled([service.placeOrder(big), service.placeOrder(input)]);

    expect(results[0].status).toBe("rejected");
    const reason = (results[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(OrderError);
    expect((reason as OrderError).code).toBe("INSUFFICIENT_STOCK");
    expect(results[1].status).toBe("fulfilled");
    const saved = JSON.parse(await readFile(file, "utf8")) as { orders: Order[] };
    expect(saved.orders).toHaveLength(1);
  });
});
