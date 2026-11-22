import { expect, test, type APIResponse } from "@playwright/test";

function expectNoLeakHeaders(response: APIResponse) {
  const headers = response.headers();
  expect(headers["referrer-policy"]).toBe("no-referrer");
  const cacheControl = headers["cache-control"];
  expect(cacheControl).toContain("no-store");
  expect(cacheControl).not.toContain("s-maxage");
  expect(cacheControl).not.toContain("public");
}

test("trang và API đơn hàng có header bảo mật", async ({ request }) => {
  expectNoLeakHeaders(await request.get("/orders/x"));
  expectNoLeakHeaders(await request.get("/orders"));
  expectNoLeakHeaders(await request.get("/api/orders/x"));
});

test("khu nhân viên có header bảo mật", async ({ request }) => {
  // Chưa có phiên: chuyển hướng/401 nhưng vẫn mang header.
  expectNoLeakHeaders(await request.get("/staff", { maxRedirects: 0 }));
  expectNoLeakHeaders(await request.get("/staff/orders", { maxRedirects: 0 }));
  expectNoLeakHeaders(await request.get("/staff/login"));
});

test("response lỗi 401/404/409 của API vẫn có no-store", async ({ request }) => {
  const notFound = await request.get("/api/orders/SL-00000000-000000");
  expect(notFound.status()).toBe(404);
  expectNoLeakHeaders(notFound);

  const unauthorized = await request.post("/api/staff/logout", { data: {} });
  expect(unauthorized.status()).toBe(401);
  expectNoLeakHeaders(unauthorized);

  const created = await request.post("/api/orders", {
    data: {
      customer: { fullName: "Nguyen Van Test", phone: "0912345678", address: "12 Nguyen Hue, Q1" },
      shippingMethod: "standard",
      paymentMethod: "cod",
      items: [{ productId: "p006", quantity: 1 }],
    },
  });
  expect(created.status()).toBe(201);
  expectNoLeakHeaders(created);
  const { id } = (await created.json()) as { id: unknown };
  expect(typeof id).toBe("string");

  const cancel = () =>
    request.patch(`/api/orders/${id as string}`, { data: { status: "cancelled" } });
  expect((await cancel()).status()).toBe(200);
  const conflict = await cancel();
  expect(conflict.status()).toBe(409);
  expectNoLeakHeaders(conflict);
});

test("trang công khai không bị ép no-store bởi cấu hình", async ({ request }) => {
  const headers = (await request.get("/products")).headers();
  expect(headers["referrer-policy"]).not.toBe("no-referrer");
  // Không kiểm cache-control: /products là trang động nên Next tự đặt no-store, không do headers().
});
