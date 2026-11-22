import { randomBytes } from "node:crypto";
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

/** Khách hàng hợp lệ theo checkout-schema (họ tên ≥ 2 ký tự, SĐT Việt Nam, địa chỉ ≥ 10 ký tự). */
export const KHACH_MAU = {
  fullName: "Khách E2E",
  phone: "0912345678",
  address: "12 Nguyễn Huệ, Quận 1, TP.HCM",
};

export interface ShopHelpers {
  addToCart(slug: string, quantity?: number): Promise<void>;
  fillCheckout(customer?: Partial<typeof KHACH_MAU>): Promise<void>;
  placeOrder(): Promise<string>;
}

function createShopHelpers(page: Page): ShopHelpers {
  return {
    async addToCart(slug, quantity = 1) {
      await page.goto(`/products/${slug}`);
      const panel = page.getByTestId("purchase-panel");
      for (let i = 1; i < quantity; i++) {
        await panel.getByRole("button", { name: "Tăng số lượng" }).click();
      }
      await expect(panel.getByRole("spinbutton", { name: "Số lượng" })).toHaveValue(
        String(quantity),
      );
      await panel.getByRole("button", { name: "Thêm vào giỏ" }).click();
      await expect(panel.getByRole("button", { name: "Đã thêm" })).toBeVisible();
    },
    async fillCheckout(customer = {}) {
      const data = { ...KHACH_MAU, ...customer };
      await page.getByLabel(/Họ và tên/).fill(data.fullName);
      await page.getByLabel(/Số điện thoại/).fill(data.phone);
      await page.getByLabel(/Địa chỉ giao hàng/).fill(data.address);
    },
    async placeOrder() {
      await page.getByRole("button", { name: "Đặt hàng" }).click();
      await expect(page).toHaveURL(/\/orders\/SL-\d{8}-[0-9A-F]{6}\?placed=1/);
      return page.url().match(/SL-\d{8}-[0-9A-F]{6}/)![0];
    },
  };
}

/**
 * Tạo sẵn một đơn "Chờ xác nhận" qua API - dùng khi phần cần kiểm không phải là đặt hàng (ví dụ hủy đơn).
 * Muốn trình duyệt của test là chủ đơn (cookie chứng minh sở hữu), truyền `page.request` thay vì
 * fixture `request`: chỉ `page.request` dùng chung cookie với trang.
 */
export async function createPendingOrder(request: APIRequestContext): Promise<string> {
  const response = await request.post("/api/orders", {
    data: {
      customer: KHACH_MAU,
      shippingMethod: "standard",
      paymentMethod: "cod",
      items: [{ productId: "p010", quantity: 1 }],
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

// Tên tham số thứ hai là `provide` (không phải `use`) để ESLint rules-of-hooks không nhầm với React hook.
export const test = base.extend<{ shop: ShopHelpers }>({
  // Mỗi test một IP riêng (10.a.b.c): bộ đếm giới hạn thử sai của app khóa theo IP và nằm trong bộ nhớ
  // của một dev server, nên chạy lặp / nhiều test cùng IP sẽ chạm giới hạn 5 lần sai/15 phút.
  // Cần TRUSTED_PROXY_HOPS=1 ở playwright.config.ts để app đọc x-forwarded-for.
  extraHTTPHeaders: async ({}, provide) => {
    const [a, b, c] = randomBytes(3);
    await provide({ "x-forwarded-for": `10.${a}.${b}.${c}` });
  },
  shop: async ({ page }, provide) => {
    await provide(createShopHelpers(page));
  },
});

export { expect };
