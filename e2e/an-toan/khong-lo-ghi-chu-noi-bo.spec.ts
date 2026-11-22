// spec: specs/tieu-chi.md (Luồng C, AT-7)
import { expect, KHACH_MAU, test } from "./fixtures";

test(
  "AT-7 mọi response gửi Khách không có khóa internalNotes; danh sách nhân viên thì có",
  { tag: "@AT-7" },
  async ({ staff, stranger, owner }) => {
    const url = `/api/orders/${owner.orderId}`;

    // Mỗi dòng: một đường trả dữ liệu đơn cho Khách (kể cả khi người gọi là nhân viên)
    const duongTraKhach = [
      {
        ten: "POST /api/orders (201)",
        status: 201,
        goi: () =>
          owner.request.post("/api/orders", {
            data: {
              customer: KHACH_MAU,
              shippingMethod: "standard",
              paymentMethod: "cod",
              items: [{ productId: "p010", quantity: 1 }],
            },
          }),
      },
      { ten: "GET /api/orders/:id (chủ đơn)", status: 200, goi: () => owner.request.get(url) },
      { ten: "GET /api/orders/:id (nhân viên)", status: 200, goi: () => staff.get(url) },
      {
        ten: "trang /orders/:id (chủ đơn)",
        status: 200,
        goi: () => owner.request.get(`/orders/${owner.orderId}`),
      },
      {
        ten: "POST /api/orders/lookup",
        status: 200,
        goi: () =>
          stranger.post("/api/orders/lookup", {
            data: { orderId: owner.orderId, phone: owner.phone },
          }),
      },
      {
        ten: "PATCH /api/orders/:id (hủy)",
        status: 200,
        goi: () => owner.request.patch(url, { data: { status: "cancelled" } }),
      },
    ];

    for (const duong of duongTraKhach) {
      await test.step(duong.ten, async () => {
        const response = await duong.goi();
        expect(response.status()).toBe(duong.status);
        expect(await response.text()).not.toContain("internalNotes");
      });
    }

    await test.step("lookup chỉ trả khóa orderId", async () => {
      const response = await stranger.post("/api/orders/lookup", {
        data: { orderId: owner.orderId, phone: owner.phone },
      });
      expect(Object.keys((await response.json()) as object)).toEqual(["orderId"]);
    });

    await test.step("danh sách đầy đủ của nhân viên có khóa internalNotes (mảng rỗng)", async () => {
      const response = await staff.get("/api/orders");
      expect(response.status()).toBe(200);
      const { orders } = (await response.json()) as { orders: Record<string, unknown>[] };
      expect(orders.length).toBeGreaterThan(0);
      for (const order of orders) expect(order).toHaveProperty("internalNotes");
    });
  },
);
