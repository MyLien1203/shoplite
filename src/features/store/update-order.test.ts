// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrderError } from "@/features/orders/order-errors";
import type { Order } from "@/features/orders/types";
import { createInMemoryStoreGateway } from "./in-memory-store";
import { createJsonFileStoreGateway } from "./json-file-store";
import { createEmptyStore, type StoreData } from "./store-types";
import { updateOrder } from "./update-order";

const order = (id: string): Order => ({
  id,
  status: "pending",
  createdAt: "2026-10-21T03:00:00.000Z",
  updatedAt: "2026-10-21T03:00:00.000Z",
  customer: { fullName: "A", phone: "0901234567", address: "1 Trần Phú" },
  shippingMethod: "standard",
  paymentMethod: "cod",
  items: [],
  subtotal: 0,
  shippingFee: 0,
  total: 0,
  source: "web",
  statusHistory: [{ status: "pending", at: "2026-10-21T03:00:00.000Z" }],
  internalNotes: [],
});

const seed = (): StoreData => ({
  ...createEmptyStore(),
  orders: [order("A"), order("B")],
  inventory: { p1: 5 },
  adjustments: [
    {
      id: "adj1",
      productId: "p1",
      delta: -1,
      before: 6,
      after: 5,
      reason: "x",
      at: "t",
    },
  ],
});

const confirm = (o: Order): Order => ({ ...o, status: "confirmed" });

const edit = (id: string, fn: (o: Order) => Order) => (data: StoreData) => {
  const r = updateOrder(data, id, fn);
  return { data: r.data, result: r.order };
};

describe("updateOrder (in-memory)", () => {
  it("sửa đúng đơn B, giữ nguyên đơn A, inventory và adjustments", async () => {
    const gateway = createInMemoryStoreGateway(seed());
    const result = await gateway.update(edit("B", confirm));
    expect(result.status).toBe("confirmed");
    const after = await gateway.read();
    expect(after.orders.find((o) => o.id === "A")).toEqual(order("A"));
    expect(after.orders.find((o) => o.id === "B")?.status).toBe("confirmed");
    expect(after.inventory).toEqual(seed().inventory);
    expect(after.adjustments).toEqual(seed().adjustments);
  });

  it("không đột biến dữ liệu đầu vào", () => {
    const data = seed();
    const snapshot = structuredClone(data);
    updateOrder(data, "B", (o) => {
      o.status = "cancelled";
      return o;
    });
    expect(data).toEqual(snapshot);
  });

  it("order trả về là bản sao: sửa nó không đổi data.orders", () => {
    const result = updateOrder(seed(), "B", confirm);
    result.order.status = "cancelled";
    expect(result.data.orders.find((o) => o.id === "B")?.status).toBe(
      "confirmed",
    );
  });

  it("không có đơn: ném ORDER_NOT_FOUND 404 và không ghi gì", async () => {
    const gateway = createInMemoryStoreGateway(seed());
    const error = await gateway
      .update(edit("Z", confirm))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OrderError);
    expect(error).toMatchObject({
      code: "ORDER_NOT_FOUND",
      httpStatus: 404,
      message: 'Không tìm thấy đơn hàng "Z"',
    });
    expect(await gateway.read()).toEqual(seed());
  });

  it("fn ném: lỗi gốc ném lại, không ghi, update kế tiếp vẫn chạy", async () => {
    const gateway = createInMemoryStoreGateway(seed());
    const boom = new Error("boom");
    await expect(
      gateway.update(
        edit("B", () => {
          throw boom;
        }),
      ),
    ).rejects.toBe(boom);
    expect(await gateway.read()).toEqual(seed());
    expect((await gateway.update(edit("B", confirm))).status).toBe("confirmed");
  });

  it("fn đổi id: bị từ chối, không ghi", async () => {
    const gateway = createInMemoryStoreGateway(seed());
    await expect(
      gateway.update(edit("B", (o) => ({ ...o, id: "A" }))),
    ).rejects.toThrow(/id/);
    expect(await gateway.read()).toEqual(seed());
  });
});

describe("updateOrder (JSON thật)", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "shoplite-update-order-"));
    file = path.join(dir, "store.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("Promise.all hai updateOrder khác đơn: cả hai thay đổi đều có trong file", async () => {
    const gateway = createJsonFileStoreGateway(file);
    await gateway.update(() => ({ data: seed(), result: null }));
    await Promise.all([
      gateway.update(edit("A", (o) => ({ ...o, status: "shipping" }))),
      gateway.update(edit("B", confirm)),
    ]);
    const onDisk = JSON.parse(await readFile(file, "utf8")) as StoreData;
    expect(onDisk.orders.find((o) => o.id === "A")?.status).toBe("shipping");
    expect(onDisk.orders.find((o) => o.id === "B")?.status).toBe("confirmed");
  });
});
