// spec: specs/mua-hang.plan.md
// seed: e2e/seed.spec.ts
import { test, expect, createPendingOrder, KHACH_MAU } from "../fixtures";

test.describe("Thanh toán và đơn hàng", () => {
  test(
    "DH-4 người lạ không hủy được và không xem được đơn của người khác",
    { tag: "@DH-4" },
    async ({ page, context }) => {
      // 1. Tạo đơn bằng trình duyệt của test rồi xóa cookie: từ đây trình duyệt là người lạ
      const orderId = await createPendingOrder(page.request);
      await context.clearCookies();

      // 2. Gửi lệnh hủy: nhận 404
      const stranger = await page.request.patch(`/api/orders/${orderId}`, {
        data: { status: "cancelled" },
      });
      expect(stranger.status()).toBe(404);

      // 3. Mở trang đơn: chỉ thấy form tra cứu, không thấy dữ liệu đơn
      await page.goto(`/orders/${orderId}`);
      await expect(page.getByRole("heading", { name: "Tra cứu đơn hàng" })).toBeVisible();
      await expect(
        page.getByText("Không tìm thấy đơn hàng. Kiểm tra lại Mã đơn và số điện thoại."),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Hủy đơn hàng" })).toHaveCount(0);
      await expect(page.getByText(KHACH_MAU.fullName)).toHaveCount(0);
    },
  );
});
