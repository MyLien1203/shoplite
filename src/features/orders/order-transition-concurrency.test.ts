// @vitest-environment node
import { promises as nodeFs } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJsonFileStoreGateway, type StoreFs } from "@/features/store/json-file-store";
import type { StoreGateway } from "@/features/store/store-gateway";
import type { StoreData } from "@/features/store/store-types";
import { OrderError } from "./order-errors";
import { createOrderService } from "./order-service";

const FIXED_DATE = new Date("2026-10-21T03:00:00.000Z");

function orderInput(productId = "p011", quantity = 1) {
  return {
    customer: {
      fullName: "Trần Thị B",
      phone: "0987654321",
      address: "45 Lê Lợi, Hải Châu, Đà Nẵng",
    },
    shippingMethod: "standard",
    paymentMethod: "cod",
    items: [{ productId, quantity }],
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** fs thật nhưng readFile trễ vài ms (mở rộng cửa sổ chồng) và có thể ép lỗi ghi. */
function createFakeFs(options: { readDelayMs?: number } = {}) {
  const state: { fail: "none" | "rename" | "write" } = { fail: "none" };
  const enospc = () => Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
  const fs: StoreFs = {
    ...nodeFs,
    readFile: (async (...args: Parameters<typeof nodeFs.readFile>) => {
      if (options.readDelayMs) await sleep(options.readDelayMs);
      return nodeFs.readFile(...args);
    }) as StoreFs["readFile"],
    writeFile: (async (...args: Parameters<typeof nodeFs.writeFile>) => {
      if (state.fail === "write") {
        // Ghi dở: một phần byte xuống tmp rồi báo hết chỗ.
        await nodeFs.writeFile(args[0], '{"schemaVersion":1,"ord', "utf8");
        throw enospc();
      }
      return nodeFs.writeFile(...args);
    }) as StoreFs["writeFile"],
    rename: (async (...args: Parameters<typeof nodeFs.rename>) => {
      if (state.fail === "rename") throw enospc();
      return nodeFs.rename(...args);
    }) as StoreFs["rename"],
  };
  return { fs, state };
}

describe("transitionOrder / cancelByCustomer đồng thời trên store JSON thật", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "shoplite-transition-conc-"));
    file = path.join(dir, "store.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function setup(stock: number, orderCount: number, fsOptions?: { readDelayMs?: number }) {
    const fake = createFakeFs(fsOptions);
    const store: StoreGateway = createJsonFileStoreGateway(file, { fs: fake.fs });
    await store.update((data) => ({
      data: { ...data, inventory: { p011: stock } },
      result: undefined,
    }));
    const logEvent = vi.fn();
    const service = createOrderService({ store, now: () => FIXED_DATE, logEvent });
    const ids: string[] = [];
    for (let i = 0; i < orderCount; i++) {
      ids.push((await service.placeOrder(orderInput())).id);
    }
    return { store, service, logEvent, ids, fake };
  }

  async function saved(): Promise<StoreData> {
    return JSON.parse(await readFile(file, "utf8")) as StoreData;
  }

  it("hai đơn, món cuối: đúng một xác nhận được, tồn về 0, bên thua INSUFFICIENT_STOCK", async () => {
    const { store, service, logEvent, ids } = await setup(1, 2);
    const [a, b] = ids;

    const results = await Promise.allSettled([
      service.transitionOrder(a, "confirmed"),
      service.transitionOrder(b, "confirmed"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(OrderError);
    expect((rejected[0].reason as OrderError).code).toBe("INSUFFICIENT_STOCK");
    expect((rejected[0].reason as OrderError).message).toContain("Giá đỡ laptop nhôm");

    const onDisk = await saved();
    expect(onDisk.inventory.p011).toBe(0);
    expect((await store.read()).inventory.p011).toBe(0);
    const statuses = onDisk.orders.map((o) => o.status).sort();
    expect(statuses).toEqual(["confirmed", "pending"]);

    const rejectedLogs = logEvent.mock.calls.filter(([name]) => name === "confirm_rejected_stock");
    expect(rejectedLogs).toHaveLength(1);
    expect(rejectedLogs[0][1]).toEqual({ productId: "p011" });
    for (const [, fields] of logEvent.mock.calls) {
      expect(Object.keys(fields as object)).toEqual(["productId"]);
    }
  });

  it("nhiều đơn, kho hạn: tồn 4, 10 xác nhận thì đúng 4 thành công, 6 INSUFFICIENT_STOCK", async () => {
    const { service, ids } = await setup(4, 10, { readDelayMs: 2 });

    const results = await Promise.allSettled(
      ids.map((id) => service.transitionOrder(id, "confirmed")),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(6);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(OrderError);
      expect((r.reason as OrderError).code).toBe("INSUFFICIENT_STOCK");
    }
    const onDisk = await saved();
    expect(onDisk.inventory.p011).toBe(0);
    expect(onDisk.orders.filter((o) => o.status === "confirmed")).toHaveLength(4);
    expect(onDisk.orders.filter((o) => o.status === "pending")).toHaveLength(6);
  });

  it("cùng một đơn xác nhận hai lần đồng thời: tồn trừ một lần, một mục lịch sử confirmed", async () => {
    const { service, ids } = await setup(3, 1);
    const [a] = ids;

    const [first, second] = await Promise.all([
      service.transitionOrder(a, "confirmed"),
      service.transitionOrder(a, "confirmed"),
    ]);

    expect(first.status).toBe("confirmed");
    expect(second).toEqual(first);
    const onDisk = await saved();
    expect(onDisk.inventory.p011).toBe(2);
    const order = onDisk.orders.find((o) => o.id === a);
    expect(order?.status).toBe("confirmed");
    expect(order?.statusHistory.filter((h) => h.status === "confirmed")).toHaveLength(1);
  });

  it("xác nhận đua với Khách hủy (confirm gọi trước): confirm thắng, hủy 409", async () => {
    const { service, ids } = await setup(3, 1);
    const [a] = ids;

    const results = await Promise.allSettled([
      service.transitionOrder(a, "confirmed"),
      service.cancelByCustomer(a),
    ]);

    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    const reason = (results[1] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(OrderError);
    expect((reason as OrderError).code).toBe("INVALID_STATUS_TRANSITION");
    const onDisk = await saved();
    const order = onDisk.orders.find((o) => o.id === a);
    expect(order?.status).toBe("confirmed");
    expect(onDisk.inventory.p011).toBe(2);
    expect(order?.statusHistory.some((h) => h.status === "cancelled")).toBe(false);
  });

  it("đảo thứ tự (hủy gọi trước): hủy thắng, kho y nguyên, confirm 409 và không log hết tồn", async () => {
    const { service, ids, logEvent } = await setup(3, 1);
    const [a] = ids;

    const results = await Promise.allSettled([
      service.cancelByCustomer(a),
      service.transitionOrder(a, "confirmed"),
    ]);

    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    const reason = (results[1] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(OrderError);
    expect((reason as OrderError).code).toBe("INVALID_STATUS_TRANSITION");
    const onDisk = await saved();
    const order = onDisk.orders.find((o) => o.id === a);
    expect(order?.status).toBe("cancelled");
    expect(onDisk.inventory.p011).toBe(3);
    expect(order?.statusHistory.some((h) => h.status === "confirmed")).toBe(false);
    expect(logEvent.mock.calls.some(([name]) => name === "confirm_rejected_stock")).toBe(false);
  });

  it.each([
    ["rename", "rename"],
    ["writeFile ghi dở", "write"],
  ] as const)(
    "ghi lỗi giữa chừng (%s ENOSPC): store.json nguyên byte, đơn pending, không .tmp, xác nhận lại được",
    async (_label, mode) => {
      const { service, ids, logEvent, fake } = await setup(3, 1);
      const [a] = ids;
      const before = await readFile(file);

      fake.state.fail = mode;
      const error = await service.transitionOrder(a, "confirmed").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(OrderError);
      expect((error as NodeJS.ErrnoException).code).toBe("ENOSPC");
      expect((await readFile(file)).equals(before)).toBe(true);
      expect((await readdir(dir)).sort()).toEqual(["store.json"]);
      const onDisk = await saved();
      expect(onDisk.orders.find((o) => o.id === a)?.status).toBe("pending");
      expect(onDisk.inventory.p011).toBe(3);
      expect(logEvent.mock.calls.some(([name]) => name === "confirm_rejected_stock")).toBe(false);

      fake.state.fail = "none";
      const retried = await service.transitionOrder(a, "confirmed");
      expect(retried.status).toBe("confirmed");
      expect((await saved()).inventory.p011).toBe(2);
    },
  );

  it("điều chỉnh chồng xác nhận: tồn 3, confirm -1, +5, -1 đồng thời thì còn 6, không mất cập nhật", async () => {
    const { store, service, ids } = await setup(3, 1, { readDelayMs: 3 });
    const [a] = ids;
    const adjust = (delta: number) =>
      store.update((data) => ({
        data: {
          ...data,
          inventory: { ...data.inventory, p011: (data.inventory.p011 ?? 0) + delta },
        },
        result: undefined,
      }));

    await Promise.all([service.transitionOrder(a, "confirmed"), adjust(5), adjust(-1)]);

    expect((await saved()).inventory.p011).toBe(6);
    expect((await store.read()).inventory.p011).toBe(6);
  });
});
