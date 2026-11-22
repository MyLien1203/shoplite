// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const call = (q?: string) => {
  const url = new URL("http://localhost/api/products/suggest");
  if (q !== undefined) url.searchParams.set("q", q);
  return GET(new NextRequest(url));
};

describe("GET /api/products/suggest", () => {
  beforeEach(() => {
    holder.gateway = seed({});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("khai force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("200: 'usb' trả Cáp USB-C trước, Micro inStock false", async () => {
    const response = await call("usb");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      suggestions: [
        { slug: "cap-usb-c-ben-du-2m", name: "Cáp USB-C bện dù 2m", price: 150_000, inStock: true },
        {
          slug: "micro-thu-am-podcast-usb",
          name: "Micro thu âm PodCast USB",
          price: 1_150_000,
          inStock: false,
        },
      ],
    });
  });

  it("dùng tồn kho thực: Cáp USB-C tồn 0 thì xếp sau và inStock false", async () => {
    holder.gateway = seed({ p010: 0 });
    const body = await (await call("usb")).json();
    expect(body.suggestions.every((s: { inStock: boolean }) => !s.inStock)).toBe(true);
  });

  it("200 rỗng khi không có kết quả", async () => {
    const response = await call("xyz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: [] });
  });

  it.each(["tai(", "(.*.*)*!"])("ký tự đặc biệt '%s': 200, rỗng, dưới 100 ms", async (q) => {
    const start = performance.now();
    const response = await call(q);
    expect(performance.now() - start).toBeLessThan(100);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: [] });
  });

  it.each([
    ["quá ngắn", "a"],
    ["thiếu q", undefined],
    ["quá dài (51 ký tự)", "a".repeat(51)],
  ])("400 VALIDATION_ERROR khi %s", async (_label, q) => {
    const response = await call(q);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("store hỏng: 500 INTERNAL_ERROR, không rò chi tiết", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    holder.gateway = {
      ...seed({}),
      read: async () => {
        throw new StoreError("CORRUPT_STORE", "chi tiết nội bộ bí mật");
      },
    };
    const response = await call("usb");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("bí mật");
  });
});
