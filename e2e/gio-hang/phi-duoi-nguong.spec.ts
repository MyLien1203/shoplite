// spec: specs/mua-hang.plan.md
// seed: e2e/seed.spec.ts
import { test, expect } from "../fixtures";

test.describe("Giỏ hàng và phí giao hàng", () => {
  test(
    "GH-3 dưới 500.000đ: tính phí 30.000đ và gợi ý số tiền cần mua thêm",
    { tag: "@GH-3" },
    async ({ page, shop }) => {
      // 1. Thêm 1 Bàn di chuột cỡ lớn DeskMat XL (250.000 ₫) vào giỏ rồi mở /cart
      await shop.addToCart("ban-di-chuot-deskmat-xl");
      await page.goto("/cart");
      const summary = page.getByRole("complementary").filter({ hasText: "Tóm tắt đơn hàng" });

      await expect(
        summary.getByText("Mua thêm 250.000 ₫ để được miễn phí giao hàng"),
      ).toBeVisible();
      await expect(summary.getByText("Tạm tính", { exact: true }).locator("..")).toContainText(
        "250.000 ₫",
      );
      await expect(
        summary.getByText("Phí giao hàng (tiêu chuẩn)", { exact: true }).locator(".."),
      ).toContainText("30.000 ₫");
      await expect(page.getByTestId("cart-total")).toHaveText("280.000 ₫");
    },
  );
});
