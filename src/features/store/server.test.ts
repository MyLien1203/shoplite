// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStoreGateway } from "./server";

const KEY = Symbol.for("shoplite.store");
const holder = globalThis as unknown as Record<symbol, unknown>;

describe("getStoreGateway", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "shoplite-store-srv-"));
    delete holder[KEY];
    vi.stubEnv("STORE_FILE", path.join(dir, "store.json"));
    vi.stubEnv("ORDERS_FILE", path.join(dir, "orders.json"));
  });

  afterEach(async () => {
    delete holder[KEY];
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  it("trả cùng một instance qua globalThis", () => {
    const first = getStoreGateway();
    expect(getStoreGateway()).toBe(first);
    expect(holder[KEY]).toBe(first);
  });

  it("STORE_FILE rỗng rơi về storage/store.json dưới cwd", async () => {
    vi.stubEnv("STORE_FILE", "");
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    await getStoreGateway().update((data) => ({ data, result: null }));
    const onDisk = JSON.parse(
      await readFile(path.join(dir, "storage", "store.json"), "utf8"),
    );
    expect(onDisk.schemaVersion).toBe(1);
    vi.restoreAllMocks();
  });

  it("đọc STORE_FILE lúc gọi và ghi vào đó", async () => {
    const gateway = getStoreGateway();
    await gateway.update((data) => ({
      data: { ...data, inventory: { p1: 2 } },
      result: null,
    }));
    const onDisk = JSON.parse(
      await readFile(path.join(dir, "store.json"), "utf8"),
    );
    expect(onDisk.inventory).toEqual({ p1: 2 });
  });

  it("ORDERS_FILE trỏ tới file đơn cũ: read trả đơn đã chuẩn hóa", async () => {
    await writeFile(
      path.join(dir, "orders.json"),
      JSON.stringify([
        {
          id: "SL-1",
          status: "cancelled",
          createdAt: "2026-10-21T03:00:00.000Z",
          updatedAt: "2026-10-22T03:00:00.000Z",
        },
      ]),
    );
    const [order] = (await getStoreGateway().read()).orders;
    expect(order.source).toBe("web");
    expect(order.statusHistory).toHaveLength(2);
    expect(order.internalNotes).toEqual([]);
  });

  it("ORDERS_FILE rỗng: dùng <cwd>/storage/orders.json", async () => {
    vi.stubEnv("ORDERS_FILE", "");
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    await mkdir(path.join(dir, "storage"));
    await writeFile(
      path.join(dir, "storage", "orders.json"),
      JSON.stringify([
        {
          id: "SL-1",
          status: "cancelled",
          createdAt: "2026-10-21T03:00:00.000Z",
          updatedAt: "2026-10-22T03:00:00.000Z",
        },
      ]),
    );
    const [order] = (await getStoreGateway().read()).orders;
    expect(order.source).toBe("web");
    expect(order.statusHistory).toHaveLength(2);
    expect(order.internalNotes).toEqual([]);
    vi.restoreAllMocks();
  });
});
