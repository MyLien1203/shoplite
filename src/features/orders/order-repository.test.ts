// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryStoreGateway } from "@/features/store/in-memory-store";
import { createJsonFileStoreGateway } from "@/features/store/json-file-store";
import {
  createJsonFileOrderRepository,
  createStoreOrderRepository,
} from "./order-repository";
import type { Order } from "./types";

const sampleOrder = (id: string): Order => ({
  id,
  status: "pending",
  createdAt: "2026-10-21T03:00:00.000Z",
  updatedAt: "2026-10-21T03:00:00.000Z",
  customer: {
    fullName: "Lê Văn C",
    phone: "0901234567",
    address: "1 Trần Phú, Hà Đông, Hà Nội",
  },
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

describe("createJsonFileOrderRepository", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "shoplite-orders-"));
    file = path.join(dir, "nested", "orders.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("trả về danh sách rỗng khi file chưa tồn tại", async () => {
    const repository = createJsonFileOrderRepository(file);
    expect(await repository.findAll()).toEqual([]);
    expect(await repository.findById("SL-1")).toBeNull();
  });

  it("tạo thư mục, ghi file và đọc lại được", async () => {
    const repository = createJsonFileOrderRepository(file);
    await repository.save(sampleOrder("SL-1"));

    const raw = JSON.parse(await readFile(file, "utf8"));
    expect(raw).toHaveLength(1);
    expect(await repository.findById("SL-1")).toMatchObject({ id: "SL-1" });
  });

  it("cập nhật đơn hàng đã tồn tại thay vì thêm bản sao", async () => {
    const repository = createJsonFileOrderRepository(file);
    await repository.save(sampleOrder("SL-1"));
    await repository.save({ ...sampleOrder("SL-1"), status: "cancelled" });

    const orders = await repository.findAll();
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("cancelled");
  });
});

describe.each([
  ["in-memory", () => createInMemoryStoreGateway()],
  [
    "JSON file",
    (dir: string) => createJsonFileStoreGateway(path.join(dir, "store.json")),
  ],
])("createStoreOrderRepository (%s)", (_name, makeGateway) => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "shoplite-orepo-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("findAll và findById trả đơn đã chuẩn hóa từ store seed kiểu cũ", async () => {
    const { source, statusHistory, internalNotes, ...old } = sampleOrder("SL-OLD");
    void source;
    void statusHistory;
    void internalNotes;
    const gateway = makeGateway(dir);
    await gateway.update((data) => ({
      data: { ...data, orders: [{ ...old, status: "cancelled" } as unknown as Order] },
      result: null,
    }));
    const repository = createStoreOrderRepository(gateway);
    const [fromAll] = await repository.findAll();
    const fromId = await repository.findById("SL-OLD");
    for (const found of [fromAll, fromId]) {
      expect(found?.source).toBe("web");
      expect(found?.internalNotes).toEqual([]);
      expect(found?.statusHistory.map((h) => h.status)).toEqual(["pending", "cancelled"]);
    }
  });

  it("insert đơn mới giữ id và đọc lại được", async () => {
    const repository = createStoreOrderRepository(makeGateway(dir));
    const saved = await repository.save(sampleOrder("SL-20261021-AAAAAA"));
    expect(saved.id).toBe("SL-20261021-AAAAAA");
    expect(await repository.findById("SL-20261021-AAAAAA")).toEqual(saved);
    expect(await repository.findAll()).toHaveLength(1);
    expect(await repository.findById("nope")).toBeNull();
  });

  it("id trùng: sinh Mã đơn mới, không ghi đè đơn cũ", async () => {
    const repository = createStoreOrderRepository(makeGateway(dir));
    await repository.save({ ...sampleOrder("SL-20261021-AAAAAA"), total: 111 });
    const saved = await repository.save({
      ...sampleOrder("SL-20261021-AAAAAA"),
      total: 222,
    });
    expect(saved.id).not.toBe("SL-20261021-AAAAAA");
    expect(saved.id).toMatch(/^SL-20261021-[0-9A-F]{6}$/);
    expect(await repository.findAll()).toHaveLength(2);
    expect((await repository.findById("SL-20261021-AAAAAA"))?.total).toBe(111);
    expect((await repository.findById(saved.id))?.total).toBe(222);
  });

  it("ném lỗi sau 10 lần sinh id vẫn trùng", async () => {
    const repository = createStoreOrderRepository(makeGateway(dir), {
      generateId: () => "SL-20261021-AAAAAA",
    });
    await repository.save(sampleOrder("SL-20261021-AAAAAA"));
    await expect(
      repository.save(sampleOrder("SL-20261021-AAAAAA")),
    ).rejects.toThrow();
    expect(await repository.findAll()).toHaveLength(1);
  });
});
