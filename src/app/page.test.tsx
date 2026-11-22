import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFeaturedProducts } from "@/features/catalog/catalog-service";
import { createInMemoryStoreGateway } from "@/features/store/in-memory-store";
import type { StoreGateway } from "@/features/store/store-gateway";
import { createEmptyStore } from "@/features/store/store-types";
import HomePage, { dynamic } from "./page";

const holder = vi.hoisted(() => ({ gateway: undefined as StoreGateway | undefined }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/store/server", () => ({ getStoreGateway: () => holder.gateway }));

describe("/ (trang chủ, tồn kho thực)", () => {
  beforeEach(() => {
    holder.gateway = createInMemoryStoreGateway(createEmptyStore());
  });

  it("khai force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("lưới nổi bật hiện Hết hàng khi tồn phủ 0, giữ số lượng", async () => {
    const featured = getFeaturedProducts(4);
    const inventory = Object.fromEntries(featured.map((p) => [p.id, 0]));
    holder.gateway = createInMemoryStoreGateway({ ...createEmptyStore(), inventory });
    render(await HomePage());
    expect(screen.getAllByText("Hết hàng").length).toBeGreaterThanOrEqual(featured.length);
  });
});
