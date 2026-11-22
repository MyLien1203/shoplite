// spec: specs/mua-hang.plan.md
// seed: e2e/seed.spec.ts
import { test, expect } from "../fixtures";

test.describe("Thanh toán và đơn hàng", () => {
  test(
    "DH-1 đặt hàng thành công: đơn Chờ xác nhận, miễn phí giao hàng, giỏ được làm trống",
    { tag: "@DH-1" },
    async ({ page, shop }) => {
      // 1. Thêm 2 Bàn di chuột cỡ lớn DeskMat XL vào giỏ, mở /checkout
      await shop.addToCart("ban-di-chuot-deskmat-xl", 2);
      await page.goto("/checkout");

      // 2. Điền thông tin giao hàng; giữ giao tiêu chuẩn và thanh toán COD
      await shop.fillCheckout({
        fullName: "Nguyễn Văn A",
        phone: "0912345678",
        address: "12 Nguyễn Huệ, Quận 1, TP.HCM",
      });
      await expect(page.getByTestId("shipping-fee")).toHaveText("Miễn phí");
      await expect(page.getByTestId("checkout-total")).toHaveText("500.000 ₫");

      // 3. Bấm "Đặt hàng"
      const orderId = await shop.placeOrder();
      await expect(page.getByText("Đặt hàng thành công!")).toBeVisible();
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toContainText(`Đơn hàng ${orderId}`);
      await expect(heading).toContainText("Chờ xác nhận");
      await expect(page.getByText("Tạm tính", { exact: true }).locator("..")).toContainText(
        "500.000 ₫",
      );
      await expect(page.getByText("Phí giao hàng", { exact: true }).locator("..")).toContainText(
        "Miễn phí",
      );
      await expect(page.getByText("Tổng cộng", { exact: true }).locator("..")).toContainText(
        "500.000 ₫",
      );

      // Khách vừa đặt xem được đơn ngay, không phải tra cứu; giỏ hàng đã trống
      await expect(page.getByRole("heading", { name: "Tra cứu đơn hàng" })).toHaveCount(0);
      await expect(page.getByTestId("cart-count")).toHaveCount(0);
    },
  );
});
