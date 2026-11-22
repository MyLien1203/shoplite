// spec: specs/mua-hang.plan.md
// seed: e2e/seed.spec.ts
import { test, expect, createPendingOrder } from "../fixtures";

test.describe("Thanh toán và đơn hàng", () => {
  test(
    "DH-4 hủy đơn chờ xác nhận: bấm Không giữ nguyên, xác nhận thì đổi ngay không cần tải lại",
    { tag: "@DH-4" },
    async ({ page }) => {
      // 1. Tạo đơn qua API bằng chính trình duyệt của test (là chủ đơn), mở trang chi tiết
      const orderId = await createPendingOrder(page.request);
      await page.goto(`/orders/${orderId}`);
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toContainText("Chờ xác nhận");

      // 2. Bấm "Hủy đơn hàng" rồi "Không": đơn giữ nguyên
      await page.getByRole("button", { name: "Hủy đơn hàng" }).click();
      await expect(page.getByText("Bạn chắc chắn muốn hủy đơn hàng này?")).toBeVisible();
      await page.getByRole("button", { name: "Không" }).click();
      await expect(heading).toContainText("Chờ xác nhận");
      await expect(page.getByRole("button", { name: "Hủy đơn hàng" })).toBeVisible();

      // 3. Bấm "Hủy đơn hàng" rồi "Xác nhận hủy": chờ đúng phản hồi PATCH, không tải lại trang
      await page.getByRole("button", { name: "Hủy đơn hàng" }).click();
      const cancelResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "PATCH" &&
          response.url().endsWith(`/api/orders/${orderId}`),
      );
      await page.getByRole("button", { name: "Xác nhận hủy" }).click();
      expect((await cancelResponse).status()).toBe(200);
      await expect(heading).toContainText("Đã hủy");
      await expect(page.getByRole("button", { name: "Hủy đơn hàng" })).toHaveCount(0);
    },
  );
});
