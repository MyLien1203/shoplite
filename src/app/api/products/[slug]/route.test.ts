// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProductById } from "@/features/catalog/catalog-service";
import { createInMemoryStoreGateway } from "@/features/store/in-memory-store";
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

const call = (slug: string) =>
  GET(new Request(`http://localhost/api/products/${slug}`), {
    params: Promise.resolve({ slug }),
  } as Parameters<typeof GET>[1]);

const p011 = getProductById("p011");
if (!p011) throw new Error("thiếu p011");

describe("GET /api/products/:slug (tồn kho thực)", () => {
  beforeEach(() => {
    holder.gateway = seed({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("khai force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("inventory rỗng: trả tồn tĩnh", async () => {
    const response = await call(p011.slug);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { stock: number }).stock).toBe(p011.stock);
  });

  it("p011 tồn 0: stock 0", async () => {
    holder.gateway = seed({ p011: 0 });
    const body = (await (await call(p011.slug)).json()) as { stock: number };
    expect(body.stock).toBe(0);
  });

  it("slug lạ: 404 PRODUCT_NOT_FOUND", async () => {
    const response = await call("khong-co");
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "PRODUCT_NOT_FOUND",
    );
  });

  it("store hỏng: 500 INTERNAL_ERROR, không rơi về tồn tĩnh", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    holder.gateway = {
      ...seed({}),
      read: async () => {
        throw new StoreError("CORRUPT_STORE", "chi tiết nội bộ bí mật");
      },
    };
    const response = await call(p011.slug);
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain("INTERNAL_ERROR");
    expect(text).not.toContain("bí mật");
  });
});
