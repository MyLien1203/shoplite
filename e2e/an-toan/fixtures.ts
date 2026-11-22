import type { APIRequestContext, BrowserContext } from "@playwright/test";
import { createPendingOrder, expect, KHACH_MAU, test as base } from "../fixtures";

export { expect, KHACH_MAU };

/** Mật khẩu nhân viên của E2E: khớp `STAFF_PASSWORD` ở `playwright.config.ts` (giá trị giả). */
export const STAFF_PASSWORD = "e2e-staff-password";

export const LOOKUP_NOT_FOUND = "Không tìm thấy đơn hàng. Kiểm tra lại Mã đơn và số điện thoại.";
export const RATE_LIMITED = "Bạn đã thử sai quá nhiều lần. Vui lòng thử lại sau 15 phút.";

/** Chủ đơn: một context riêng (cookie `sl_own` của đúng đơn này) và một đơn Chờ xác nhận. */
export interface Owner {
  context: BrowserContext;
  request: APIRequestContext;
  orderId: string;
  phone: string;
}

export interface ApiError {
  error: { code: string; message: string };
}

interface AnToanFixtures {
  /** API context đã đăng nhập nhân viên, mang cookie `sl_staff`. */
  staff: APIRequestContext;
  /** API context mới, không cookie nào, cùng IP riêng của test. */
  stranger: APIRequestContext;
  /** Chủ của một đơn Chờ xác nhận do chính test này tạo. */
  owner: Owner;
}

// Tham số thứ hai tên `provide` (không phải `use`) để ESLint rules-of-hooks không nhầm với React hook.
export const test = base.extend<AnToanFixtures & { gioiHanThoiGian: void }>({
  // `next dev` biên dịch từng tuyến ở lần chạm đầu (và máy dùng chung với trình duyệt khác), nên các test
  // đầu của một lần chạy lạnh có thể vượt 30 giây mặc định dù không sai gì. Nới giới hạn cho cả nhóm.
  gioiHanThoiGian: [
    async ({}, provide, testInfo) => {
      testInfo.setTimeout(90_000);
      await provide();
    },
    { auto: true },
  ],

  staff: async ({ playwright, baseURL, extraHTTPHeaders }, provide) => {
    const context = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { ...extraHTTPHeaders, "Content-Type": "application/json" },
    });
    const login = await context.post("/api/staff/login", { data: { password: STAFF_PASSWORD } });
    expect(login.status(), "đăng nhập nhân viên bằng mật khẩu E2E").toBe(200);
    await provide(context);
    await context.dispose();
  },

  stranger: async ({ playwright, baseURL, extraHTTPHeaders }, provide) => {
    const context = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { ...extraHTTPHeaders, "Content-Type": "application/json" },
    });
    await provide(context);
    await context.dispose();
  },

  owner: async ({ browser, baseURL, extraHTTPHeaders }, provide) => {
    const context = await browser.newContext({ baseURL, extraHTTPHeaders });
    const orderId = await createPendingOrder(context.request);
    await provide({ context, request: context.request, orderId, phone: KHACH_MAU.phone });
    await context.close();
  },
});
