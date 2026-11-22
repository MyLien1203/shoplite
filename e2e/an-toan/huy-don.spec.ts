// spec: specs/tieu-chi.md (Luồng C, AT-5)
import { expect, test, type ApiError } from "./fixtures";

test(
  "AT-5 người lạ hủy đơn nhận 404, chủ đơn hủy được 200 rồi hủy lại nhận 409",
  { tag: "@AT-5" },
  async ({ stranger, owner }) => {
    const url = `/api/orders/${owner.orderId}`;

    await test.step("người lạ: 404 trước cả khi kiểm body, đơn không đổi", async () => {
      const valid = await stranger.patch(url, { data: { status: "cancelled" } });
      expect(valid.status()).toBe(404);
      expect(((await valid.json()) as ApiError).error.code).toBe("ORDER_NOT_FOUND");

      const badBody = await stranger.patch(url, { data: { status: "confirmed" } });
      expect(badBody.status()).toBe(404);

      const still = await owner.request.get(url);
      expect(((await still.json()) as { status: string }).status).toBe("pending");
    });

    await test.step("chủ đơn: 200, đơn thành cancelled", async () => {
      const response = await owner.request.patch(url, { data: { status: "cancelled" } });
      expect(response.status()).toBe(200);
      expect(((await response.json()) as { status: string }).status).toBe("cancelled");
    });

    await test.step("trang đơn hiện Đã hủy và không còn nút hủy", async () => {
      const page = await owner.context.newPage();
      await page.goto(`/orders/${owner.orderId}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Đã hủy");
      await expect(page.getByRole("button", { name: "Hủy đơn hàng" })).toHaveCount(0);
    });

    await test.step("hủy lần hai: 409 INVALID_STATUS_TRANSITION", async () => {
      const again = await owner.request.patch(url, { data: { status: "cancelled" } });
      expect(again.status()).toBe(409);
      const body = (await again.json()) as ApiError;
      expect(body.error.code).toBe("INVALID_STATUS_TRANSITION");
      expect(body.error.message).toBe("Chỉ có thể hủy đơn hàng đang ở trạng thái Chờ xác nhận");
    });
  },
);
