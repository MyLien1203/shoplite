import { expect, test } from "./fixtures";

test("khách hàng tìm sản phẩm, thêm vào giỏ và đặt hàng thành công", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Mua sắm ngay" }).click();

  // Tìm kiếm không dấu
  await page.getByLabel("Từ khóa tìm kiếm").fill("chuot khong day");
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await expect(page).toHaveURL(/q=chuot\+khong\+day/);
  await expect(page.getByTestId("product-card")).toHaveCount(1);

  // Chi tiết sản phẩm -> thêm 2 sản phẩm vào giỏ
  await page.getByRole("link", { name: "Chuột không dây SwiftClick" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chuột không dây SwiftClick");
  const purchasePanel = page.getByTestId("purchase-panel");
  await purchasePanel.getByRole("button", { name: "Tăng số lượng" }).click();
  await purchasePanel.getByRole("button", { name: "Thêm vào giỏ" }).click();
  await expect(page.getByTestId("cart-count")).toHaveText("2");

  // Giỏ hàng: 2 x 450.000đ = 900.000đ, miễn phí giao hàng
  await page.getByRole("link", { name: /Giỏ hàng/ }).click();
  await expect(page.getByTestId("cart-total")).toContainText("900.000");
  await page.getByRole("link", { name: "Tiến hành thanh toán" }).click();

  // Thanh toán
  await page.getByLabel(/Họ và tên/).fill("Nguyễn Văn Test");
  await page.getByLabel(/Số điện thoại/).fill("0912345678");
  await page.getByLabel(/Địa chỉ giao hàng/).fill("12 Nguyễn Huệ, Quận 1, TP.HCM");
  await page.getByRole("button", { name: "Đặt hàng" }).click();

  // Trang chi tiết đơn hàng
  await expect(page).toHaveURL(/\/orders\/SL-\d{8}-[0-9A-F]{6}\?placed=1/);
  await expect(page.getByText("Đặt hàng thành công!")).toBeVisible();
  await expect(page.getByTestId("cart-count")).toHaveCount(0);

  const orderId = page.url().match(/SL-\d{8}-[0-9A-F]{6}/)![0];
  // Khách vừa đặt vẫn thấy đơn của mình
  await expect(page.getByRole("heading", { name: `Đơn hàng ${orderId}` })).toBeVisible();

  // Xóa cookie: người lạ mở lại đường dẫn đơn chỉ thấy form tra cứu, không lộ dữ liệu
  await context.clearCookies();
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByRole("heading", { name: "Tra cứu đơn hàng" })).toBeVisible();
  await expect(page.getByLabel(/Mã đơn/)).toHaveValue(orderId);
  await expect(page.getByText("Không tìm thấy đơn hàng")).toBeVisible();
  await expect(page.getByText("Nguyễn Văn Test")).toHaveCount(0);
  await expect(page.getByText("0912345678")).toHaveCount(0);
  await expect(page.getByText("12 Nguyễn Huệ")).toHaveCount(0);

  // Tra cứu bằng Mã đơn + SĐT
  await page.getByRole("link", { name: "Đơn hàng", exact: true }).first().click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByRole("heading", { name: "Tra cứu đơn hàng" })).toBeVisible();
  await page.getByLabel(/Mã đơn/).fill(orderId);
  await page.getByLabel(/Số điện thoại/).fill("0912345679");
  await page.getByRole("button", { name: "Xem đơn hàng" }).click();
  await expect(page.getByText("Không tìm thấy đơn hàng")).toBeVisible();

  await page.getByLabel(/Số điện thoại/).fill("0912345678");
  await page.getByRole("button", { name: "Xem đơn hàng" }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
  await expect(page.getByRole("heading", { name: `Đơn hàng ${orderId}` })).toBeVisible();

  // Liên kết tra cứu sai: form điền sẵn Mã đơn, SĐT trống, fragment bị xóa
  await context.clearCookies();
  await page.goto(`/orders#code=${orderId}&phone=0912345679`);
  await expect(page.getByLabel(/Mã đơn/)).toHaveValue(orderId);
  await expect(page.getByLabel(/Số điện thoại/)).toHaveValue("");
  await expect(page.getByText("Không tìm thấy đơn hàng")).toBeVisible();
  expect(page.url()).not.toContain("#");

  // Liên kết tra cứu đúng (SĐT +84): vào thẳng đơn, địa chỉ không còn tham số
  // (rời /orders trước: chỉ đổi fragment trên cùng trang là điều hướng cùng tài liệu, không tải lại)
  await page.goto("/");
  await page.goto(`/orders#code=${orderId}&phone=%2B84912345678`);
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
  await expect(page.getByRole("heading", { name: `Đơn hàng ${orderId}` })).toBeVisible();
  expect(page.url()).not.toContain("phone");
  expect(page.url()).not.toContain("code");
});

test("lọc theo danh mục và sắp xếp theo giá", async ({ page }) => {
  await page.goto("/products");
  await page
    .getByRole("link", { name: /Âm thanh/ })
    .first()
    .click();
  await expect(page).toHaveURL(/category=am-thanh/);
  await expect(page.getByTestId("product-card")).toHaveCount(4);

  await page.getByLabel("Sắp xếp").selectOption("price-asc");
  await expect(page).toHaveURL(/sort=price-asc/);
  await expect(page.getByTestId("product-card").first()).toContainText(
    "Loa Bluetooth BeatBox Mini",
  );
});
