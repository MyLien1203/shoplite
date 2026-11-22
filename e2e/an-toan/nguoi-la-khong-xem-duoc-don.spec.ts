// spec: specs/tieu-chi.md (Luồng C, AT-1)
import { expect, KHACH_MAU, LOOKUP_NOT_FOUND, test, type ApiError } from "./fixtures";

const MA_KHONG_TON_TAI = "SL-20200101-AAAAAA";

test.describe("Chỉ chủ đơn hoặc nhân viên xem được đơn", () => {
  test(
    "AT-1 người lạ mở /orders/<mã> chỉ thấy form tra cứu, chủ đơn thấy đủ thông tin",
    { tag: "@AT-1" },
    async ({ page, owner }) => {
      // `page` có context riêng, không cookie: đó là người lạ. `owner.context` là chủ đơn.
      const ownerPage = await owner.context.newPage();

      await test.step("chủ đơn thấy tên, SĐT, địa chỉ", async () => {
        await ownerPage.goto(`/orders/${owner.orderId}`);
        await expect(
          ownerPage.getByRole("heading", { name: `Đơn hàng ${owner.orderId}` }),
        ).toBeVisible();
        await expect(ownerPage.getByText(KHACH_MAU.fullName, { exact: true })).toBeVisible();
        await expect(ownerPage.getByText(KHACH_MAU.phone)).toBeVisible();
        await expect(ownerPage.getByText(KHACH_MAU.address)).toBeVisible();
      });

      await test.step("người lạ chỉ thấy form tra cứu, không lộ dữ liệu", async () => {
        await page.goto(`/orders/${owner.orderId}`);
        await expect(page.getByRole("heading", { name: "Tra cứu đơn hàng" })).toBeVisible();
        await expect(page.getByLabel(/Mã đơn/)).toHaveValue(owner.orderId);
        await expect(page.getByText("Không tìm thấy đơn hàng")).toBeVisible();
        await expect(page.getByText(KHACH_MAU.fullName)).toHaveCount(0);
        await expect(page.getByText(KHACH_MAU.phone)).toHaveCount(0);
        await expect(page.getByText("12 Nguyễn Huệ")).toHaveCount(0);
      });
    },
  );

  test(
    "AT-1 API: người lạ nhận 404 cùng lời với mã không tồn tại, nhân viên nhận 200",
    { tag: "@AT-1" },
    async ({ stranger, staff, owner }) => {
      const denied = await stranger.get(`/api/orders/${owner.orderId}`);
      expect(denied.status()).toBe(404);
      const deniedBody = (await denied.json()) as ApiError;
      expect(deniedBody.error.code).toBe("ORDER_NOT_FOUND");
      expect(deniedBody.error.message).toBe(LOOKUP_NOT_FOUND);

      // Không phân biệt "đơn không tồn tại" với "đơn không phải của bạn"
      const missing = await stranger.get(`/api/orders/${MA_KHONG_TON_TAI}`);
      expect(missing.status()).toBe(404);
      expect(await missing.json()).toEqual(deniedBody);

      // Nhân viên có phiên xem được mọi đơn; chủ đơn xem được đơn của mình
      const asStaff = await staff.get(`/api/orders/${owner.orderId}`);
      expect(asStaff.status()).toBe(200);
      expect(((await asStaff.json()) as { id: string }).id).toBe(owner.orderId);
      const asOwner = await owner.request.get(`/api/orders/${owner.orderId}`);
      expect(asOwner.status()).toBe(200);
    },
  );
});
