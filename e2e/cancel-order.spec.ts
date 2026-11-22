import { expect, test } from "./fixtures";

test("chủ đơn hủy được đơn Chờ xác nhận, người lạ nhận 404", async ({ page, context }) => {
  // page.request chia sẻ cookie với context và không gửi Origin nên vượt kiểm CSRF.
  const placed = await page.request.post("/api/orders", {
    data: {
      customer: {
        fullName: "Nguyễn Văn Hủy",
        phone: "0912345678",
        address: "12 Nguyễn Huệ, Quận 1, TP.HCM",
      },
      shippingMethod: "standard",
      paymentMethod: "cod",
      items: [{ productId: "p010", quantity: 1 }],
    },
  });
  expect(placed.status()).toBe(201);
  const { id } = (await placed.json()) as { id: string };

  await page.goto(`/orders/${id}`);
  await page.getByRole("button", { name: "Hủy đơn hàng" }).click();
  await expect(page.getByText("Bạn chắc chắn muốn hủy đơn hàng này?")).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận hủy" }).click();

  await expect(page.getByText("Đã hủy").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Hủy đơn hàng" })).toHaveCount(0);

  await context.clearCookies();
  const stranger = await page.request.patch(`/api/orders/${id}`, {
    data: { status: "cancelled" },
  });
  expect(stranger.status()).toBe(404);
});
