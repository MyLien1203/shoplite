// @vitest-environment node
import { describe, expect, it } from "vitest";
import { products } from "@/data/products";
import { createInMemoryStoreGateway } from "@/features/store/in-memory-store";
import { createEmptyStore, StoreError } from "@/features/store/store-types";
import { getStockedProducts, overlayStock } from "./server";

const seeded = (inventory: Record<string, number>) =>
  createInMemoryStoreGateway({ ...createEmptyStore(), inventory });

const stockOf = (list: { id: string; stock: number }[], id: string) =>
  list.find((p) => p.id === id)?.stock;

describe("getStockedProducts", () => {
  it("phủ tồn từ inventory, khóa 0 vẫn thắng tồn tĩnh, sản phẩm khác giữ tồn tĩnh", async () => {
    const result = await getStockedProducts(seeded({ p011: 7, p001: 0 }));
    expect(stockOf(result, "p011")).toBe(7);
    expect(stockOf(result, "p001")).toBe(0);
    const other = products.find((p) => p.id !== "p011" && p.id !== "p001")!;
    expect(stockOf(result, other.id)).toBe(other.stock);
  });

  it("inventory rỗng: tồn bằng tồn tĩnh, cùng số lượng và thứ tự", async () => {
    const result = await getStockedProducts(seeded({}));
    expect(result.map((p) => p.id)).toEqual(products.map((p) => p.id));
    expect(result.map((p) => p.stock)).toEqual(products.map((p) => p.stock));
  });

  it("bỏ qua khóa inventory không có trong catalog", async () => {
    const result = await getStockedProducts(seeded({ p999: 4 }));
    expect(result).toHaveLength(products.length);
    expect(result.some((p) => p.id === "p999")).toBe(false);
  });

  it("không đổi catalog tĩnh và giữ nguyên các trường khác", async () => {
    const result = await getStockedProducts(seeded({ p011: 7 }));
    expect(products.find((p) => p.id === "p011")!.stock).toBe(3);
    const stocked = result.find((p) => p.id === "p011")!;
    const original = products.find((p) => p.id === "p011")!;
    expect(stocked).not.toBe(original);
    expect({ ...stocked, stock: 0 }).toEqual({ ...original, stock: 0 });
  });

  it("không cache: mỗi lần gọi đọc lại store", async () => {
    let inventory: Record<string, number> = { p011: 7 };
    const store = { read: async () => ({ ...createEmptyStore(), inventory }) };
    expect(stockOf(await getStockedProducts(store), "p011")).toBe(7);
    inventory = { p011: 0 };
    expect(stockOf(await getStockedProducts(store), "p011")).toBe(0);
  });

  it("store hỏng: từ chối đúng lỗi CORRUPT_STORE, không trả tồn tĩnh", async () => {
    const error = new StoreError("CORRUPT_STORE", "hỏng");
    const store = {
      read: async () => {
        throw error;
      },
    };
    await expect(getStockedProducts(store)).rejects.toBe(error);
  });
});

describe("overlayStock", () => {
  it("không đổi mảng đầu vào", () => {
    const catalog = [...products];
    overlayStock(catalog, { p011: 9 });
    expect(catalog).toEqual(products);
    expect(stockOf(products, "p011")).toBe(3);
  });
});
