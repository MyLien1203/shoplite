// spec: specs/tieu-chi.md (Luồng C, AT-2, AT-3)
import { expect, STAFF_PASSWORD, test, type ApiError } from "./fixtures";

test.describe("Khu nhân viên", () => {
  test(
    "AT-2a chưa đăng nhập mở /staff bị chuyển tới /staff/login",
    { tag: "@AT-2" },
    async ({ page }) => {
      await page.goto("/staff");
      await expect(page).toHaveURL(/\/staff\/login$/);
      await expect(page.getByRole("heading", { name: "Đăng nhập nhân viên" })).toBeVisible();
    },
  );

  test(
    "AT-2b đăng nhập đúng mật khẩu vào được /staff và thấy Đơn cần xử lý",
    { tag: "@AT-2" },
    async ({ page }) => {
      await page.goto("/staff/login");
      await page.getByLabel("Mật khẩu").fill(STAFF_PASSWORD);
      await page.getByRole("button", { name: "Đăng nhập" }).click();
      await expect(page).toHaveURL(/\/staff$/);
      await expect(page.getByRole("heading", { name: "Đơn cần xử lý" })).toBeVisible();
    },
  );

  test(
    "AT-2c sai mật khẩu: thấy Mật khẩu không đúng và ở lại trang đăng nhập",
    { tag: "@AT-2" },
    async ({ page }) => {
      await page.goto("/staff/login");
      await page.getByLabel("Mật khẩu").fill("sai-mat-khau");
      await page.getByRole("button", { name: "Đăng nhập" }).click();
      await expect(page.getByText("Mật khẩu không đúng.")).toBeVisible();
      await expect(page).toHaveURL(/\/staff\/login$/);
      // Nút dùng lại được, không bị khóa sau lần sai đầu tiên
      await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
    },
  );

  test(
    "AT-2d cookie sl_staff giả không đủ để vào /staff",
    { tag: "@AT-2" },
    async ({ page, context, baseURL }) => {
      // Proxy chỉ kiểm cookie có mặt; chữ ký sai bị chính trang từ chối.
      await context.addCookies([{ name: "sl_staff", value: "gia-mao", url: baseURL }]);
      await page.goto("/staff");
      await expect(page).toHaveURL(/\/staff\/login\?expired=1$/);
      await expect(page.getByText("Phiên đã hết hạn, vui lòng đăng nhập lại.")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Đơn cần xử lý" })).toHaveCount(0);
    },
  );

  test(
    "AT-3 GET /api/orders: không phiên (hoặc cookie giả) 401 UNAUTHORIZED, có phiên 200",
    { tag: "@AT-3" },
    async ({ stranger, staff, owner }) => {
      const noSession = await stranger.get("/api/orders");
      expect(noSession.status()).toBe(401);
      const body = (await noSession.json()) as ApiError;
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body).not.toHaveProperty("orders");

      const forged = await stranger.get("/api/orders", { headers: { Cookie: "sl_staff=gia-mao" } });
      expect(forged.status()).toBe(401);
      expect(((await forged.json()) as ApiError).error.code).toBe("UNAUTHORIZED");

      // Chủ đơn (có sl_own) cũng không phải nhân viên
      const asOwner = await owner.request.get("/api/orders");
      expect(asOwner.status()).toBe(401);

      const asStaff = await staff.get("/api/orders");
      expect(asStaff.status()).toBe(200);
      const { orders, counts } = (await asStaff.json()) as {
        orders: { id: string }[];
        counts: Record<string, number>;
      };
      expect(Array.isArray(orders)).toBe(true);
      // spec 2.8 (AD-4.6): mặc định là đơn cần xử lý, cũ nhất trước. Tìm đơn theo mã của chính test.
      expect(orders.map((order) => order.id)).toContain(owner.orderId);
      expect(counts.pending).toBeGreaterThanOrEqual(1);
    },
  );
});
