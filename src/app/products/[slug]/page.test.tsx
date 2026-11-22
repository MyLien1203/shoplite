import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProductById, getRelatedProducts } from "@/features/catalog/catalog-service";
import { createInMemoryStoreGateway } from "@/features/store/in-memory-store";
import type { StoreGateway } from "@/features/store/store-gateway";
import { createEmptyStore } from "@/features/store/store-types";
import ProductDetailPage, * as pageModule from "./page";

const holder = vi.hoisted(() => ({ gateway: undefined as StoreGateway | undefined }));
vi.mock("@/features/store/server", () => ({ getStoreGateway: () => holder.gateway }));

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const p011 = getProductById("p011");
if (!p011) throw new Error("thiếu p011");
const props = (slug: string) =>
  ({ params: Promise.resolve({ slug }) }) as Parameters<typeof ProductDetailPage>[0];

describe("/products/[slug] (tồn kho thực)", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    holder.gateway = createInMemoryStoreGateway(createEmptyStore());
  });

  it("force-dynamic và không còn generateStaticParams", () => {
    expect(pageModule.dynamic).toBe("force-dynamic");
    expect("generateStaticParams" in pageModule).toBe(false);
  });

  it("hiện Hết hàng, không có nút mua khi tồn phủ 0", async () => {
    holder.gateway = createInMemoryStoreGateway({ ...createEmptyStore(), inventory: { p011: 0 } });
    render(await ProductDetailPage(props(p011.slug)));
    expect(screen.getAllByText("Hết hàng").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("purchase-panel")).toBeNull();
    expect(screen.getByText(/Sản phẩm tạm hết hàng/)).toBeVisible();
  });

  it("inventory rỗng: hiện tồn tĩnh", async () => {
    render(await ProductDetailPage(props(p011.slug)));
    expect(screen.getByText(`Chỉ còn ${p011.stock} sản phẩm`)).toBeVisible();
  });

  it("sản phẩm liên quan cũng hiện Hết hàng khi tồn phủ 0", async () => {
    const related = getRelatedProducts(p011, 4);
    expect(related.length).toBeGreaterThan(0);
    const inventory = Object.fromEntries(related.map((p) => [p.id, 0]));
    holder.gateway = createInMemoryStoreGateway({ ...createEmptyStore(), inventory });
    render(await ProductDetailPage(props(p011.slug)));
    const section = screen.getByText("Sản phẩm liên quan").closest("section");
    if (!section) throw new Error("thiếu mục liên quan");
    expect(within(section).getAllByText("Hết hàng").length).toBeGreaterThanOrEqual(related.length);
  });

  it("slug lạ gọi notFound", async () => {
    await expect(ProductDetailPage(props("khong-co"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });
});
