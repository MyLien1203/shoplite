// spec: specs/mua-hang.plan.md
// seed: e2e/seed.spec.ts
import { test, expect } from "../fixtures";

test.describe("Giỏ hàng và phí giao hàng", () => {
  test(
    "GH-2 giỏ giữ đúng 3 cái khi kho chỉ còn 3: không thể thêm cái thứ 4",
    { tag: "@GH-2" },
    async ({ page }) => {
      // 1. Mở /products/gia-do-laptop-nhom (Giá đỡ laptop nhôm, 390.000 ₫, tồn kho 3)
      await page.goto("/products/gia-do-laptop-nhom");
      await expect(page.getByText("Chỉ còn 3 sản phẩm")).toBeVisible();
      const panel = page.getByTestId("purchase-panel");
      const increase = panel.getByRole("button", { name: "Tăng số lượng" });

      // 2. Trong khối mua hàng, bấm "Tăng số lượng" 2 lần
      await increase.click();
      await increase.click();
      await expect(panel.getByRole("spinbutton", { name: "Số lượng" })).toHaveValue("3");
      await expect(increase).toBeDisabled();

      // 3. Bấm "Thêm vào giỏ"
      await panel.getByRole("button", { name: "Thêm vào giỏ" }).click();
      await expect(page.getByRole("link", { name: "Giỏ hàng (3 sản phẩm)" })).toBeVisible();
      await expect(
        panel.getByText("Bạn đã có số lượng tối đa của sản phẩm này trong giỏ."),
      ).toBeVisible();
      await expect(panel.getByRole("button", { name: "Tối đa" })).toBeDisabled();
      await expect(panel.getByRole("button", { name: "Mua ngay" })).toBeDisabled();

      // 4. Mở /cart
      await page.goto("/cart");
      await expect(page.getByTestId("cart-item")).toHaveCount(1);
      await expect(
        page.getByRole("spinbutton", { name: "Số lượng Giá đỡ laptop nhôm" }),
      ).toHaveValue("3");
      const summary = page.getByRole("complementary").filter({ hasText: "Tóm tắt đơn hàng" });
      await expect(summary.getByText("Tạm tính", { exact: true }).locator("..")).toContainText(
        "1.170.000 ₫",
      );
      await expect(
        summary.getByText("Phí giao hàng (tiêu chuẩn)", { exact: true }).locator(".."),
      ).toContainText("Miễn phí");
    },
  );
});
