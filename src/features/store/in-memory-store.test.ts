import { describe, expect, it } from "vitest";
import { createInMemoryStoreGateway } from "./in-memory-store";
import { createEmptyStore, type StoreData } from "./store-types";

const setStock = (productId: string, qty: number) => (data: StoreData) => ({
  data: { ...data, inventory: { ...data.inventory, [productId]: qty } },
  result: qty,
});

describe("createInMemoryStoreGateway", () => {
  it("chuẩn hóa đơn cũ trong seed khi đọc", async () => {
    const legacy = {
      id: "SL-1",
      status: "pending",
      createdAt: "2026-10-21T03:00:00.000Z",
      updatedAt: "2026-10-21T03:00:00.000Z",
    };
    const seed = {
      ...createEmptyStore(),
      orders: [legacy],
    } as unknown as StoreData;
    const [order] = (await createInMemoryStoreGateway(seed).read()).orders;
    expect(order.source).toBe("web");
    expect(order.internalNotes).toEqual([]);
  });

  it("bắt đầu rỗng và nhận seed (đã sao chép)", async () => {
    expect(await createInMemoryStoreGateway().read()).toEqual(
      createEmptyStore(),
    );
    const seed = { ...createEmptyStore(), inventory: { p1: 5 } };
    const gateway = createInMemoryStoreGateway(seed);
    seed.inventory.p1 = 99;
    expect((await gateway.read()).inventory.p1).toBe(5);
  });

  it("update tuần tự và trả result", async () => {
    const gateway = createInMemoryStoreGateway();
    const seen: number[] = [];
    await Promise.all([
      gateway.update((d) => {
        seen.push(Object.keys(d.inventory).length);
        return setStock("a", 1)(d);
      }),
      gateway.update((d) => {
        seen.push(Object.keys(d.inventory).length);
        return setStock("b", 2)(d);
      }),
    ]);
    expect(seen).toEqual([0, 1]);
    expect((await gateway.read()).inventory).toEqual({ a: 1, b: 2 });
  });

  it("mutator ném: không đổi dữ liệu, chuỗi vẫn chạy", async () => {
    const gateway = createInMemoryStoreGateway();
    await expect(
      gateway.update((d) => {
        d.inventory.x = 1;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect((await gateway.read()).inventory).toEqual({});
    expect(await gateway.update(setStock("a", 3))).toBe(3);
  });

  it("update lồng bị từ chối", async () => {
    const gateway = createInMemoryStoreGateway();
    let nested: Promise<unknown> | undefined;
    await gateway.update((d) => {
      nested = gateway.update(setStock("z", 1));
      nested.catch(() => undefined);
      return setStock("a", 1)(d);
    });
    await expect(nested).rejects.toMatchObject({ code: "NESTED_UPDATE" });
    expect((await gateway.read()).inventory).toEqual({ a: 1 });
  });

  it("read gọi khi update đang chờ được xếp sau update và thấy dữ liệu đã ghi", async () => {
    const gateway = createInMemoryStoreGateway();
    const pending = gateway.update(setStock("a", 7));
    const snapshot = gateway.read();
    await pending;
    expect((await snapshot).inventory).toEqual({ a: 7 });
  });

  it("read trả bản sao", async () => {
    const gateway = createInMemoryStoreGateway();
    await gateway.update(setStock("a", 1));
    const copy = await gateway.read();
    copy.inventory.a = 100;
    expect((await gateway.read()).inventory.a).toBe(1);
  });
});
