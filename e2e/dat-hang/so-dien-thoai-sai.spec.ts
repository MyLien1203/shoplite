// spec: specs/mua-hang.plan.md
// seed: e2e/seed.spec.ts
import { test, expect } from "../fixtures";

test.describe("Thanh toán và đơn hàng", () => {
  test(
    "DH-2 số điện thoại 0212345678 (đầu số 2): báo lỗi, ở lại trang thanh toán, giỏ còn hàng",
    { tag: "@DH-2" },
    async ({ page, shop }) => {
      // 1. Thêm 1 Cáp USB-C bện dù 2m vào giỏ, mở /checkout, điền thông tin, SĐT "0212345678"
      await shop.addToCart("cap-usb-c-ben-du-2m");
      await page.goto("/checkout");
      await shop.fillCheckout({ phone: "0212345678" });

      // Ghi lại mọi lệnh tạo đơn trình duyệt gửi lên server
      const orderRequests: string[] = [];
      page.on("request", (request) => {
        if (request.method() === "POST" && request.url().endsWith("/api/orders")) {
          orderRequests.push(request.url());
        }
      });

      // 2. Bấm "Đặt hàng"
      await page.getByRole("button", { name: "Đặt hàng" }).click();
      await expect(page.getByText("Số điện thoại không hợp lệ (ví dụ: 0912345678)")).toBeVisible();
      await expect(page.getByLabel(/Số điện thoại/)).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByLabel(/Họ và tên/)).toHaveAttribute("aria-invalid", "false");
      await expect(page.getByLabel(/Địa chỉ giao hàng/)).toHaveAttribute("aria-invalid", "false");
      await expect(page).toHaveURL(/\/checkout$/);
      expect(orderRequests).toHaveLength(0);

      // 3. Mở /cart: giỏ vẫn còn hàng
      await page.goto("/cart");
      await expect(page.getByTestId("cart-item")).toHaveCount(1);
      await expect(
        page.getByRole("spinbutton", { name: "Số lượng Cáp USB-C bện dù 2m" }),
      ).toHaveValue("1");
    },
  );
});
