// spec: specs/mua-hang.plan.md
// seed: e2e/seed.spec.ts
import { test, expect } from "../fixtures";

test.describe("Giỏ hàng và phí giao hàng", () => {
  test(
    "GH-4 đúng 500.000đ: miễn phí giao hàng ở giỏ hàng và trang thanh toán",
    { tag: "@GH-4" },
    async ({ page, shop }) => {
      // 1. Thêm 2 Bàn di chuột cỡ lớn DeskMat XL (2 × 250.000 ₫ = 500.000 ₫, đúng ngưỡng) rồi mở /cart
      await shop.addToCart("ban-di-chuot-deskmat-xl", 2);
      await page.goto("/cart");
      const summary = page.getByRole("complementary").filter({ hasText: "Tóm tắt đơn hàng" });

      await expect(
        summary.getByText("Đơn hàng của bạn được miễn phí giao hàng tiêu chuẩn"),
      ).toBeVisible();
      await expect(summary.getByText("Tạm tính", { exact: true }).locator("..")).toContainText(
        "500.000 ₫",
      );
      await expect(
        summary.getByText("Phí giao hàng (tiêu chuẩn)", { exact: true }).locator(".."),
      ).toContainText("Miễn phí");
      await expect(page.getByTestId("cart-total")).toHaveText("500.000 ₫");

      // 2. Bấm "Tiến hành thanh toán"
      await page.getByRole("link", { name: "Tiến hành thanh toán" }).click();
      await expect(page).toHaveURL(/\/checkout$/);
      await expect(page.getByTestId("shipping-fee")).toHaveText("Miễn phí");
      await expect(page.getByTestId("checkout-total")).toHaveText("500.000 ₫");
    },
  );
});
