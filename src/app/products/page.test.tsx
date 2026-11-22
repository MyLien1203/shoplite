import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryStoreGateway } from "@/features/store/in-memory-store";
import type { StoreGateway } from "@/features/store/store-gateway";
import { createEmptyStore } from "@/features/store/store-types";
import ProductsPage, { dynamic } from "./page";

const holder = vi.hoisted(() => ({ gateway: undefined as StoreGateway | undefined }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/store/server", () => ({ getStoreGateway: () => holder.gateway }));

const props = (params: Record<string, string> = {}) =>
  ({ searchParams: Promise.resolve(params) }) as Parameters<typeof ProductsPage>[0];

const resultCount = () =>
  Number(screen.getByTestId("result-count").querySelector("strong")?.textContent);

describe("/products (tồn kho thực)", () => {
  beforeEach(() => {
    holder.gateway = createInMemoryStoreGateway(createEmptyStore());
  });

  it("khai force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("hiện Hết hàng khi p011 tồn 0 và inStock=1 giảm số kết quả", async () => {
    const baseline = render(await ProductsPage(props({ inStock: "1" })));
    const before = resultCount();
    baseline.unmount();

    holder.gateway = createInMemoryStoreGateway({ ...createEmptyStore(), inventory: { p011: 0 } });
    const all = render(await ProductsPage(props({ q: "giá đỡ" })));
    expect(screen.getAllByText("Hết hàng").length).toBeGreaterThan(0);
    all.unmount();

    render(await ProductsPage(props({ inStock: "1" })));
    expect(resultCount()).toBe(before - 1);
  });
});
