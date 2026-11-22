// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCatalogQuery, queryProducts } from "@/features/catalog/catalog-service";
import { createOrderService } from "@/features/orders/order-service";
import { createInMemoryStoreGateway } from "@/features/store/in-memory-store";
import { createJsonFileStoreGateway } from "@/features/store/json-file-store";
import type { StoreGateway } from "@/features/store/store-gateway";
import { createEmptyStore, StoreError } from "@/features/store/store-types";
import { dynamic, GET } from "./route";

const holder = vi.hoisted(() => ({ gateway: undefined as StoreGateway | undefined }));
vi.mock("@/features/store/server", () => ({
  getStoreGateway: () => {
    if (!holder.gateway) throw new Error("chưa gán gateway");
    return holder.gateway;
  },
}));

const seed = (inventory: Record<string, number>) =>
  createInMemoryStoreGateway({ ...createEmptyStore(), inventory });

const call = (search = "") => GET(new NextRequest(`http://localhost/api/products${search}`));

interface Body {
  items: { id: string; stock: number }[];
  total: number;
}

const stockOf = (body: Body, id: string) => body.items.find((p) => p.id === id)?.stock;

describe("GET /api/products (tồn kho thực)", () => {
  beforeEach(() => {
    holder.gateway = seed({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("khai force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("inventory rỗng: kết quả y hệt catalog tĩnh", async () => {
    const response = await call("?page=1");
    const expected = JSON.parse(JSON.stringify(queryProducts(parseCatalogQuery({ page: "1" }))));
    expect(await response.json()).toEqual(expected);
  });

  it("p011 tồn 0: stock 0, inStock=1 loại p011 và total giảm 1", async () => {
    const baseline = (await (await call("?inStock=1")).json()) as Body;
    expect(baseline.items.length).toBeGreaterThan(0);
    holder.gateway = seed({ p011: 0 });

    const all = (await (await call("?q=giá đỡ")).json()) as Body;
    expect(stockOf(all, "p011")).toBe(0);

    const filtered = (await (await call("?inStock=1")).json()) as Body;
    expect(filtered.items.some((p) => p.id === "p011")).toBe(false);
    expect(filtered.total).toBe(baseline.total - 1);
  });

  it("store hỏng: 500 INTERNAL_ERROR, không rò chi tiết", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    holder.gateway = {
      ...seed({}),
      read: async () => {
        throw new StoreError("CORRUPT_STORE", "chi tiết nội bộ bí mật");
      },
    };
    const response = await call();
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain("INTERNAL_ERROR");
    expect(text).not.toContain("bí mật");
  });

  describe("bền qua khởi động lại", () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), "shoplite-2-7-"));
    });
    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("gateway JSON thứ hai trên cùng file vẫn thấy stock 0", async () => {
      const file = path.join(dir, "store.json");
      await createJsonFileStoreGateway(file).update((data) => ({
        data: { ...data, inventory: { p011: 0 } },
        result: undefined,
      }));
      holder.gateway = createJsonFileStoreGateway(file);
      const body = (await (await call("?q=giá đỡ")).json()) as Body;
      expect(stockOf(body, "p011")).toBe(0);
    });
  });

  it("đặt món tồn 0 (giỏ cũ ghi stock 5) bị INSUFFICIENT_STOCK, giỏ không bị sửa", async () => {
    const store = seed({ p011: 0 });
    const service = createOrderService({ store });
    const item = { productId: "p011", quantity: 1, stock: 5 };
    const error = await service
      .placeOrder({
        customer: {
          fullName: "Lê Văn C",
          phone: "0912345678",
          email: "",
          address: "12 Nguyễn Huệ, Q1, TP.HCM",
        },
        shippingMethod: "standard",
        paymentMethod: "cod",
        items: [item],
      })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(item.stock).toBe(5);
    expect((await store.read()).orders).toEqual([]);
  });
});
