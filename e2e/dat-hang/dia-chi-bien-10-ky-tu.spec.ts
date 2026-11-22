// spec: specs/mua-hang.plan.md
// seed: e2e/seed.spec.ts
import { test, expect } from "../fixtures";

test.describe("Thanh toán và đơn hàng", () => {
  test(
    "DH-3 địa chỉ biên 9 và 10 ký tự: 9 bị từ chối, 10 đặt được",
    { tag: "@DH-3" },
    async ({ page, shop }) => {
      // 1. Thêm 1 Cáp USB-C bện dù 2m vào giỏ, mở /checkout, điền địa chỉ đúng 9 ký tự
      await shop.addToCart("cap-usb-c-ben-du-2m");
      await page.goto("/checkout");
      await shop.fillCheckout({ fullName: "Nguyễn Văn A", address: "12 Le Loi" });

      // 2. Bấm "Đặt hàng": bị từ chối, không tạo đơn
      await page.getByRole("button", { name: "Đặt hàng" }).click();
      await expect(page.getByText("Địa chỉ phải có ít nhất 10 ký tự")).toBeVisible();
      await expect(page).toHaveURL(/\/checkout$/);

      // 3. Sửa địa chỉ thành đúng 10 ký tự, bấm "Đặt hàng" lần nữa
      await page.getByLabel(/Địa chỉ giao hàng/).fill("12 Le Loi,");
      await page.getByRole("button", { name: "Đặt hàng" }).click();
      await expect(page).toHaveURL(/\/orders\/SL-\d{8}-[0-9A-F]{6}\?placed=1/);
      await expect(page.getByText("Đặt hàng thành công!")).toBeVisible();
    },
  );
});
