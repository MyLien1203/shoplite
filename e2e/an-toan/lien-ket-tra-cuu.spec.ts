// spec: specs/tieu-chi.md (Luồng C, AT-6)
import { expect, KHACH_MAU, RATE_LIMITED, test } from "./fixtures";

// Hai cách viết cùng một SĐT trong fragment: số thường và +84 mã hóa %2B
const SDT_TRONG_LIEN_KET = [
  { ten: "0912345678", phone: "0912345678" },
  { ten: "+84 mã hóa %2B", phone: "%2B84912345678" },
];

test.describe("Liên kết tra cứu /orders#code=...&phone=...", () => {
  for (const { ten, phone } of SDT_TRONG_LIEN_KET) {
    test(
      `AT-6a liên kết đúng (SĐT ${ten}) mở thẳng đơn và xóa fragment khỏi địa chỉ`,
      { tag: "@AT-6" },
      async ({ page, owner }) => {
        await page.goto(`/orders#code=${owner.orderId}&phone=${phone}`);
        await expect(page).toHaveURL(new RegExp(`/orders/${owner.orderId}$`));
        await expect(
          page.getByRole("heading", { name: `Đơn hàng ${owner.orderId}` }),
        ).toBeVisible();
        await expect(page.getByText(KHACH_MAU.fullName, { exact: true })).toBeVisible();
        const url = page.url();
        expect(url).not.toContain("#");
        expect(url).not.toContain("code");
        expect(url).not.toContain("phone");
        expect(url).not.toContain("912345678");
      },
    );
  }

  test(
    "AT-6b máy chủ lookup trả 503: form hiện lỗi kết nối, giữ Mã đơn, SĐT trống",
    { tag: "@AT-6" },
    async ({ page, owner }) => {
      // Giả server: chỉ chứng minh giao diện xử lý đúng câu trả lời lỗi (AT-4 kiểm server thật)
      await page.route("**/api/orders/lookup", (route) =>
        route.fulfill({ status: 503, contentType: "text/plain", body: "Service Unavailable" }),
      );

      await page.goto(`/orders#code=${owner.orderId}&phone=${owner.phone}`);
      // Lọc theo nội dung: Next cũng có một role="alert" rỗng (bộ thông báo điều hướng)
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "Không kết nối được máy chủ, vui lòng thử lại." }),
      ).toBeVisible();
      await expect(page.getByLabel(/Mã đơn/)).toHaveValue(owner.orderId);
      await expect(page.getByLabel(/Số điện thoại/)).toHaveValue("");
      await expect(page.getByRole("button", { name: "Xem đơn hàng" })).toBeEnabled();
      expect(page.url()).not.toContain("#");
    },
  );

  test(
    "AT-6c năm liên kết sai tính vào giới hạn: liên kết thứ 6 (đúng) hiện lời khóa",
    { tag: "@AT-6" },
    async ({ page, owner }) => {
      for (let lan = 0; lan < 5; lan++) {
        // Rời /orders trước mỗi lần: chỉ đổi fragment trên cùng trang không tải lại
        await page.goto("/");
        await page.goto(`/orders#code=${owner.orderId}&phone=091234567${lan}`);
        await expect(
          page.getByRole("alert").filter({ hasText: "Không tìm thấy đơn hàng" }),
        ).toBeVisible();
        await expect(page.getByLabel(/Mã đơn/)).toHaveValue(owner.orderId);
      }

      await page.goto("/");
      await page.goto(`/orders#code=${owner.orderId}&phone=${owner.phone}`);
      await expect(page.getByRole("alert").filter({ hasText: RATE_LIMITED })).toBeVisible();
      await expect(page).toHaveURL(/\/orders$/);
    },
  );
});
