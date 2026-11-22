import { describe, expect, it } from "vitest";
import {
  buildCatalogHref,
  DEFAULT_CATALOG_QUERY,
  getAllProducts,
  getDiscountPercent,
  getFeaturedProducts,
  getProductById,
  getProductBySlug,
  getRelatedProducts,
  getStockStatus,
  parseCatalogQuery,
  queryProducts,
} from "./catalog-service";
import { products } from "@/data/products";
import type { CatalogQuery, Product } from "./types";

const query = (overrides: Partial<CatalogQuery> = {}): CatalogQuery => ({
  ...DEFAULT_CATALOG_QUERY,
  ...overrides,
});

describe("parseCatalogQuery", () => {
  it("trả về giá trị mặc định khi không có tham số", () => {
    expect(parseCatalogQuery({})).toEqual({
      q: undefined,
      category: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      inStock: undefined,
      sort: "featured",
      page: 1,
    });
  });

  it("đọc đúng các tham số hợp lệ", () => {
    expect(
      parseCatalogQuery({
        q: " tai nghe ",
        category: "am-thanh",
        minPrice: "100000",
        maxPrice: "2000000",
        inStock: "1",
        sort: "price-asc",
        page: "2",
      }),
    ).toEqual({
      q: "tai nghe",
      category: "am-thanh",
      minPrice: 100_000,
      maxPrice: 2_000_000,
      inStock: true,
      sort: "price-asc",
      page: 2,
    });
  });

  it("bỏ qua tham số không hợp lệ thay vì báo lỗi", () => {
    const result = parseCatalogQuery({
      category: "khong-ton-tai",
      minPrice: "-5",
      maxPrice: "",
      sort: "random",
      page: "abc",
    });
    expect(result.category).toBeUndefined();
    expect(result.minPrice).toBeUndefined();
    expect(result.maxPrice).toBeUndefined();
    expect(result.sort).toBe("featured");
    expect(result.page).toBe(1);
  });
});

describe("queryProducts", () => {
  it("tìm kiếm không phân biệt dấu và hoa thường", () => {
    const withAccent = queryProducts(query({ q: "Bàn phím" }));
    const withoutAccent = queryProducts(query({ q: "ban phim" }));
    expect(withAccent.total).toBeGreaterThan(0);
    expect(withoutAccent.items.map((p) => p.id)).toEqual(withAccent.items.map((p) => p.id));
  });

  it("tìm theo thương hiệu và tag", () => {
    expect(queryProducts(query({ q: "fitlife" })).total).toBe(2);
    expect(queryProducts(query({ q: "chống ồn" })).items[0].id).toBe("p001");
  });

  it("lọc theo danh mục", () => {
    const result = queryProducts(query({ category: "nha-thong-minh" }));
    expect(result.total).toBe(2);
    expect(result.items.every((p) => p.categorySlug === "nha-thong-minh")).toBe(true);
  });

  it("lọc theo khoảng giá (bao gồm 2 đầu mút)", () => {
    const result = queryProducts(query({ minPrice: 450_000, maxPrice: 750_000 }));
    expect(result.items.map((p) => p.price).sort((a, b) => a - b)).toEqual([
      450_000, 590_000, 690_000, 750_000,
    ]);
  });

  it("ẩn sản phẩm hết hàng khi bật inStock", () => {
    const all = queryProducts(query(), undefined, 100);
    const inStock = queryProducts(query({ inStock: true }), undefined, 100);
    expect(all.total - inStock.total).toBe(2);
    expect(inStock.items.every((p) => p.stock > 0)).toBe(true);
  });

  it.each([
    ["price-asc", (a: number, b: number) => a <= b],
    ["price-desc", (a: number, b: number) => a >= b],
  ] as const)("sắp xếp %s", (sort, inOrder) => {
    const prices = queryProducts(query({ sort }), undefined, 100).items.map((p) => p.price);
    prices.slice(1).forEach((price, index) => expect(inOrder(prices[index], price)).toBe(true));
  });

  it("sắp xếp mới nhất theo createdAt giảm dần", () => {
    const [first] = queryProducts(query({ sort: "newest" })).items;
    expect(first.id).toBe("p014");
  });

  it("phân trang 8 sản phẩm mỗi trang và giới hạn số trang", () => {
    const page1 = queryProducts(query({ page: 1 }));
    const page2 = queryProducts(query({ page: 2 }));
    const tooFar = queryProducts(query({ page: 99 }));
    expect(page1.items).toHaveLength(8);
    expect(page1.totalPages).toBe(2);
    expect(page2.items.map((p) => p.id)).not.toContain(page1.items[0].id);
    expect(tooFar.page).toBe(2);
  });

  it("trả về danh sách rỗng nhưng vẫn có 1 trang khi không có kết quả", () => {
    const result = queryProducts(query({ q: "khongcosanphamnay" }));
    expect(result).toMatchObject({ items: [], total: 0, totalPages: 1, page: 1 });
  });
});

describe("buildCatalogHref", () => {
  it("bỏ qua giá trị mặc định để URL gọn", () => {
    expect(buildCatalogHref(query())).toBe("/products");
    expect(buildCatalogHref(query(), { page: 2 })).toBe("/products?page=2");
  });

  it("giữ các bộ lọc hiện tại khi đổi trang", () => {
    expect(buildCatalogHref(query({ q: "tai nghe", category: "am-thanh" }), { page: 2 })).toBe(
      "/products?q=tai+nghe&category=am-thanh&page=2",
    );
  });
});

describe("helpers", () => {
  it("getStockStatus", () => {
    expect(getStockStatus({ stock: 0 })).toBe("out-of-stock");
    expect(getStockStatus({ stock: 5 })).toBe("low-stock");
    expect(getStockStatus({ stock: 6 })).toBe("in-stock");
  });

  it("getDiscountPercent", () => {
    expect(getDiscountPercent({ price: 1_290_000, originalPrice: 1_590_000 })).toBe(19);
    expect(getDiscountPercent({ price: 100_000 })).toBe(0);
  });

  it("getRelatedProducts trả về sản phẩm cùng danh mục, không gồm chính nó", () => {
    const product = getProductBySlug("tai-nghe-khong-day-soundmax-pro")!;
    const related = getRelatedProducts(product);
    expect(related.length).toBeGreaterThan(0);
    expect(related.every((p) => p.categorySlug === product.categorySlug)).toBe(true);
    expect(related.map((p) => p.id)).not.toContain(product.id);
  });
});

describe("tham số source", () => {
  const stockedWith = (stocks: Record<string, number>): Product[] =>
    products.map((p) => ({ ...p, stock: stocks[p.id] ?? p.stock }));

  it("mặc định trả về dữ liệu tĩnh như trước", () => {
    expect(getAllProducts()).toBe(products);
    expect(getProductById("p011")).toBe(products.find((p) => p.id === "p011"));
    expect(getProductById("p011")!.stock).toBe(3);
  });

  it("tra theo id, slug, danh sách từ source đã phủ", () => {
    const stocked = stockedWith({ p011: 7 });
    expect(getProductById("p011", stocked)!.stock).toBe(7);
    expect(getProductBySlug("gia-do-laptop-nhom", stocked)!.stock).toBe(7);
    expect(getAllProducts(stocked)).toBe(stocked);
  });

  it("không có trong source thì undefined hoặc rỗng", () => {
    expect(getProductById("p011", [])).toBeUndefined();
    expect(getProductBySlug("gia-do-laptop-nhom", [])).toBeUndefined();
    expect(getFeaturedProducts(4, [])).toEqual([]);
    expect(getRelatedProducts(products[0], 4, [])).toEqual([]);
  });

  it("featured và related lấy từ source", () => {
    const featuredId = products.find((p) => p.featured)!.id;
    const stocked = stockedWith({ [featuredId]: 42 });
    expect(getFeaturedProducts(100, stocked).find((p) => p.id === featuredId)!.stock).toBe(42);

    const base = products.find((p) => p.id === "p011")!;
    const sibling = products.find((p) => p.categorySlug === base.categorySlug && p.id !== base.id)!;
    const related = getRelatedProducts(base, 100, stockedWith({ [sibling.id]: 42 }));
    expect(related.find((p) => p.id === sibling.id)!.stock).toBe(42);
  });

  it.each([
    [0, "out-of-stock"],
    [1, "low-stock"],
    [5, "low-stock"],
    [6, "in-stock"],
  ] as const)("getStockStatus với p011 phủ %i = %s", (stock, status) => {
    const item = getProductById("p011", stockedWith({ p011: stock }))!;
    expect(getStockStatus(item)).toBe(status);
  });

  it("inStock lọc theo tồn đã phủ, giữ nguyên tổng còn lại", () => {
    const stocked = stockedWith({ p001: 0 });
    const base = queryProducts(query({ inStock: true }), products, 100);
    const result = queryProducts(query({ inStock: true }), stocked, 100);
    expect(base.items.map((p) => p.id)).toContain("p001");
    expect(result.items.map((p) => p.id)).not.toContain("p001");
    expect(result.total).toBe(base.total - 1);
  });
});
