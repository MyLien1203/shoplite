import { beforeEach, describe, expect, it } from "vitest";
import { SHIPPING_OPTIONS } from "@/features/checkout/pricing";
import { OrderError } from "./order-errors";
import { createInMemoryStoreGateway } from "@/features/store/in-memory-store";
import type { StoreGateway } from "@/features/store/store-gateway";
import { updateOrder } from "@/features/store/update-order";
import { createOrderService, generateOrderId, type OrderService } from "./order-service";

const FIXED_DATE = new Date("2026-10-21T03:00:00.000Z");

const validInput = (overrides: Record<string, unknown> = {}) => ({
  customer: {
    fullName: "Trần Thị B",
    phone: "0987654321",
    email: "",
    address: "45 Lê Lợi, Hải Châu, Đà Nẵng",
  },
  shippingMethod: "standard",
  paymentMethod: "cod",
  items: [{ productId: "p010", quantity: 2 }], // Cáp USB-C 150.000đ
  ...overrides,
});

async function expectOrderError(promise: Promise<unknown>, code: OrderError["code"]) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(OrderError);
  expect((error as OrderError).code).toBe(code);
  return error as OrderError;
}

describe("orderService", () => {
  let store: StoreGateway;
  let service: OrderService;

  beforeEach(() => {
    store = createInMemoryStoreGateway();
    let counter = 0;
    service = createOrderService({
      store,
      now: () => FIXED_DATE,
      generateId: () => `SL-TEST-${++counter}`,
    });
  });

  describe("placeOrder", () => {
    it("tạo đơn hàng với giá lấy từ catalog và lưu vào store", async () => {
      const order = await service.placeOrder(validInput());

      expect(order).toMatchObject({
        id: "SL-TEST-1",
        status: "pending",
        createdAt: FIXED_DATE.toISOString(),
        subtotal: 300_000,
        shippingFee: SHIPPING_OPTIONS.standard.fee,
        total: 330_000,
        source: "web",
        statusHistory: [{ status: "pending", at: FIXED_DATE.toISOString() }],
        internalNotes: [],
      });
      expect(order.items[0]).toMatchObject({
        productId: "p010",
        unitPrice: 150_000,
        lineTotal: 300_000,
      });
      expect(order.customer.email).toBeUndefined();
      expect((await store.read()).orders).toEqual([order]);
    });

    it("trả đơn đã lưu, mang Mã đơn mới khi trùng id trong store", async () => {
      const ids = ["SL-DUP", "SL-DUP", "SL-NEW"];
      const svc = createOrderService({
        store,
        now: () => FIXED_DATE,
        generateId: () => ids.shift() ?? "SL-EXTRA",
      });
      const first = await svc.placeOrder(validInput());
      const second = await svc.placeOrder(validInput());
      expect(first.id).toBe("SL-DUP");
      expect(second.id).toBe("SL-NEW");
      expect((await store.read()).orders.map((o) => o.id)).toEqual(["SL-DUP", "SL-NEW"]);
    });

    it("dùng tồn lớp phủ: còn 1 thì đặt 2 bị từ chối, không ghi", async () => {
      const seeded = createInMemoryStoreGateway({
        ...(await store.read()),
        inventory: { p011: 1 },
      });
      const svc = createOrderService({ store: seeded, now: () => FIXED_DATE });
      const error = await expectOrderError(
        svc.placeOrder(validInput({ items: [{ productId: "p011", quantity: 2 }] })),
        "INSUFFICIENT_STOCK",
      );
      expect(error.message).toContain("chỉ còn 1 sản phẩm");
      expect((await seeded.read()).orders).toEqual([]);
    });

    it("lớp phủ bằng 0 thì báo hết hàng", async () => {
      const seeded = createInMemoryStoreGateway({
        ...(await store.read()),
        inventory: { p001: 0 },
      });
      const svc = createOrderService({ store: seeded, now: () => FIXED_DATE });
      const error = await expectOrderError(
        svc.placeOrder(validInput({ items: [{ productId: "p001", quantity: 1 }] })),
        "INSUFFICIENT_STOCK",
      );
      expect(error.message).toContain("đã hết hàng");
    });

    it("không trừ inventory và adjustments khi đặt", async () => {
      const seeded = createInMemoryStoreGateway({
        ...(await store.read()),
        inventory: { p010: 5 },
      });
      const svc = createOrderService({ store: seeded, now: () => FIXED_DATE });
      await svc.placeOrder(validInput());
      const data = await seeded.read();
      expect(data.inventory).toEqual({ p010: 5 });
      expect(data.adjustments).toEqual([]);
    });

    it("gộp dòng trùng rồi mới kiểm tồn", async () => {
      await expectOrderError(
        service.placeOrder(
          validInput({
            items: [
              { productId: "p011", quantity: 2 },
              { productId: "p011", quantity: 2 },
            ],
          }),
        ),
        "INSUFFICIENT_STOCK",
      );
    });

    it("từ chối một dòng có số lượng 11", async () => {
      const error = await expectOrderError(
        service.placeOrder(validInput({ items: [{ productId: "p010", quantity: 11 }] })),
        "VALIDATION_ERROR",
      );
      expect(error.details).toBeDefined();
      expect((await store.read()).orders).toEqual([]);
    });

    it("lỗi giữa giỏ không để lại đơn nửa chừng", async () => {
      await expectOrderError(
        service.placeOrder(
          validInput({
            items: [
              { productId: "p010", quantity: 1 },
              { productId: "p011", quantity: 4 },
            ],
          }),
        ),
        "INSUFFICIENT_STOCK",
      );
      expect((await store.read()).orders).toEqual([]);
    });

    it("bỏ qua giá do client gửi lên", async () => {
      const order = await service.placeOrder(
        validInput({ items: [{ productId: "p010", quantity: 1, price: 1 }] }),
      );
      expect(order.items[0].unitPrice).toBe(150_000);
    });

    it("gộp các dòng trùng sản phẩm", async () => {
      const order = await service.placeOrder(
        validInput({
          items: [
            { productId: "p010", quantity: 1 },
            { productId: "p010", quantity: 2 },
          ],
        }),
      );
      expect(order.items).toHaveLength(1);
      expect(order.items[0].quantity).toBe(3);
    });

    it("miễn phí giao hàng tiêu chuẩn cho đơn từ 500.000đ", async () => {
      const order = await service.placeOrder(
        validInput({ items: [{ productId: "p001", quantity: 1 }] }),
      );
      expect(order.shippingFee).toBe(0);
    });

    it("trả lỗi VALIDATION_ERROR kèm chi tiết từng field", async () => {
      const error = await expectOrderError(
        service.placeOrder(validInput({ customer: { fullName: "", phone: "123", address: "" } })),
        "VALIDATION_ERROR",
      );
      expect(error.details).toHaveProperty(["customer.phone"]);
      expect(error.httpStatus).toBe(400);
    });

    it("từ chối giỏ hàng trống", async () => {
      await expectOrderError(service.placeOrder(validInput({ items: [] })), "VALIDATION_ERROR");
    });

    it("trả lỗi PRODUCT_NOT_FOUND khi sản phẩm không tồn tại", async () => {
      await expectOrderError(
        service.placeOrder(validInput({ items: [{ productId: "p999", quantity: 1 }] })),
        "PRODUCT_NOT_FOUND",
      );
    });

    it("trả lỗi INSUFFICIENT_STOCK khi vượt tồn kho hoặc hết hàng", async () => {
      // Giá đỡ laptop (p011) chỉ còn 3 sản phẩm, micro (p004) đã hết hàng
      await expectOrderError(
        service.placeOrder(validInput({ items: [{ productId: "p011", quantity: 4 }] })),
        "INSUFFICIENT_STOCK",
      );
      await expectOrderError(
        service.placeOrder(validInput({ items: [{ productId: "p004", quantity: 1 }] })),
        "INSUFFICIENT_STOCK",
      );
    });
  });

  describe("listOrders / getOrder", () => {
    it("liệt kê đơn hàng mới nhất trước", async () => {
      let time = FIXED_DATE.getTime();
      const timedService = createOrderService({
        store,
        now: () => new Date((time += 60_000)),
      });
      const first = await timedService.placeOrder(validInput());
      const second = await timedService.placeOrder(validInput());

      const orders = await timedService.listOrders();
      expect(orders.map((order) => order.id)).toEqual([second.id, first.id]);
    });

    it("trả lỗi ORDER_NOT_FOUND với mã đơn không tồn tại", async () => {
      await expectOrderError(service.getOrder("SL-KHONG-CO"), "ORDER_NOT_FOUND");
    });
  });

  describe("cancelByCustomer", () => {
    it("hai lời gọi song song: một thành công, một INVALID_STATUS_TRANSITION", async () => {
      const order = await service.placeOrder(validInput());
      const results = await Promise.allSettled([
        service.cancelByCustomer(order.id),
        service.cancelByCustomer(order.id),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: "INVALID_STATUS_TRANSITION",
        message: "Chỉ có thể hủy đơn hàng đang ở trạng thái Chờ xác nhận",
      });
      const stored = await service.getOrder(order.id);
      expect(stored.statusHistory.filter((h) => h.status === "cancelled")).toHaveLength(1);
    });

    it("hủy đơn đang chờ xác nhận", async () => {
      const order = await service.placeOrder(validInput());
      const cancelled = await service.cancelByCustomer(order.id);
      expect(cancelled.status).toBe("cancelled");
      expect((await service.getOrder(order.id)).status).toBe("cancelled");
    });

    it("không cho hủy đơn đã hủy hoặc đã xác nhận", async () => {
      const order = await service.placeOrder(validInput());
      await store.update((data) => {
        const r = updateOrder(data, order.id, (o) => ({
          ...o,
          status: "confirmed",
        }));
        return { data: r.data, result: undefined };
      });
      const before = await store.read();
      await expectOrderError(service.cancelByCustomer(order.id), "INVALID_STATUS_TRANSITION");
      expect(await store.read()).toEqual(before);
    });

    it("trả ORDER_NOT_FOUND khi hủy id không tồn tại", async () => {
      await expectOrderError(service.cancelByCustomer("SL-KHONG-CO"), "ORDER_NOT_FOUND");
    });

    it("ghi statusHistory [pending, cancelled] khi hủy", async () => {
      const order = await service.placeOrder(validInput());
      const cancelled = await service.cancelByCustomer(order.id);
      expect(cancelled.statusHistory).toEqual([
        { status: "pending", at: FIXED_DATE.toISOString() },
        { status: "cancelled", at: cancelled.updatedAt },
      ]);
      expect((await service.getOrder(order.id)).statusHistory).toHaveLength(2);
    });

    it.each(["shipping", "delivered"] as const)(
      "không cho hủy đơn %s: 409 cùng lời HC-1, dữ liệu không đổi",
      async (status) => {
        const order = await service.placeOrder(validInput());
        await store.update((data) => {
          const r = updateOrder(data, order.id, (o) => ({ ...o, status }));
          return { data: r.data, result: undefined };
        });
        const before = await store.read();
        const error = await expectOrderError(
          service.cancelByCustomer(order.id),
          "INVALID_STATUS_TRANSITION",
        );
        expect(error.message).toBe("Chỉ có thể hủy đơn hàng đang ở trạng thái Chờ xác nhận");
        expect(error.httpStatus).toBe(409);
        expect(await store.read()).toEqual(before);
      },
    );

    it("không cho hủy đơn đã hủy, statusHistory giữ nguyên", async () => {
      const order = await service.placeOrder(validInput());
      await service.cancelByCustomer(order.id);
      await expectOrderError(service.cancelByCustomer(order.id), "INVALID_STATUS_TRANSITION");
      expect((await service.getOrder(order.id)).statusHistory).toHaveLength(2);
    });
  });
});

describe("orderService.lookupOrder", () => {
  it("khớp Mã đơn + SĐT (+84 hay 0) trả Mã đơn, sai thì 404 cùng lời", async () => {
    const service = createOrderService({
      store: createInMemoryStoreGateway(),
      now: () => FIXED_DATE,
      generateId: () => "SL-20261021-4F9A2C",
    });
    await service.placeOrder(
      validInput({ customer: { ...validInput().customer, phone: "+84987654321" } }),
    );

    await expect(service.lookupOrder(" sl-20261021-4f9a2c ", "0987654321")).resolves.toBe(
      "SL-20261021-4F9A2C",
    );
    const messages: string[] = [];
    for (const [id, phone] of [
      ["SL-20261021-4F9A2C", "0900000000"],
      ["SL-NOPE", "0987654321"],
      ["SL-NOPE", "abc"],
    ]) {
      const error = await expectOrderError(service.lookupOrder(id, phone), "ORDER_NOT_FOUND");
      messages.push(error.message);
    }
    expect(new Set(messages)).toEqual(
      new Set(["Không tìm thấy đơn hàng. Kiểm tra lại Mã đơn và số điện thoại."]),
    );
  });
});

describe("generateOrderId", () => {
  it("có dạng SL-YYYYMMDD-XXXXXX", () => {
    expect(generateOrderId(FIXED_DATE)).toMatch(/^SL-20261021-[0-9A-F]{6}$/);
  });
});

describe("orderService.transitionOrder", () => {
  let store: StoreGateway;
  let service: OrderService;
  let logs: { name: string; fields: Record<string, unknown> }[];
  let counter: number;

  const place = (items: { productId: string; quantity: number }[]) =>
    service.placeOrder(validInput({ items }));
  const setInventory = (inventory: Record<string, number>) =>
    store.update((data) => ({ data: { ...data, inventory }, result: undefined }));

  beforeEach(() => {
    store = createInMemoryStoreGateway();
    logs = [];
    counter = 0;
    service = createOrderService({
      store,
      now: () => FIXED_DATE,
      generateId: () => `SL-TEST-${++counter}`,
      logEvent: (name, fields) => logs.push({ name, fields }),
    });
  });

  it("xác nhận đủ tồn: đổi trạng thái, một mục lịch sử, trừ tồn thực", async () => {
    const order = await place([{ productId: "p011", quantity: 2 }]);
    const confirmed = await service.transitionOrder(order.id, "confirmed");
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.statusHistory.filter((h) => h.status === "confirmed")).toHaveLength(1);
    expect(confirmed.statusHistory).toHaveLength(2);
    const data = await store.read();
    expect(data.inventory.p011).toBe(1);
    expect(data.orders[0]).toEqual(confirmed);
    expect(logs).toEqual([]);
  });

  it("xác nhận về đúng 0", async () => {
    const order = await place([{ productId: "p011", quantity: 3 }]);
    await service.transitionOrder(order.id, "confirmed");
    expect((await store.read()).inventory.p011).toBe(0);
  });

  it("thiếu tồn: 409, đơn vẫn pending, không dòng nào bị trừ, log đúng một lần chỉ có productId", async () => {
    const order = await place([
      { productId: "p010", quantity: 2 },
      { productId: "p011", quantity: 2 },
    ]);
    await setInventory({ p010: 10, p011: 1 });
    const before = await store.read();
    const error = await expectOrderError(
      service.transitionOrder(order.id, "confirmed"),
      "INSUFFICIENT_STOCK",
    );
    expect(error.httpStatus).toBe(409);
    expect(error.message).toContain(
      'Sản phẩm "' + before.orders[0].items[1].name + '" chỉ còn 1 sản phẩm',
    );
    expect(await store.read()).toEqual(before);
    expect((await service.getOrder(order.id)).status).toBe("pending");
    expect(logs).toEqual([{ name: "confirm_rejected_stock", fields: { productId: "p011" } }]);
  });

  it("log productId của dòng thiếu đầu tiên theo thứ tự dòng đơn", async () => {
    const order = await place([
      { productId: "p011", quantity: 2 },
      { productId: "p010", quantity: 2 },
    ]);
    await setInventory({ p010: 0, p011: 1 });
    await expectOrderError(service.transitionOrder(order.id, "confirmed"), "INSUFFICIENT_STOCK");
    expect(logs).toEqual([{ name: "confirm_rejected_stock", fields: { productId: "p011" } }]);
  });

  it("hai đơn cùng p011×3: đơn thứ hai xác nhận thiếu tồn", async () => {
    const a = await place([{ productId: "p011", quantity: 3 }]);
    const b = await place([{ productId: "p011", quantity: 3 }]);
    await service.transitionOrder(a.id, "confirmed");
    await expectOrderError(service.transitionOrder(b.id, "confirmed"), "INSUFFICIENT_STOCK");
    expect((await store.read()).inventory.p011).toBe(0);
    expect((await service.getOrder(b.id)).status).toBe("pending");
  });

  it("hủy: thêm mục lịch sử, inventory y nguyên", async () => {
    const order = await place([{ productId: "p011", quantity: 2 }]);
    await setInventory({ p011: 2 });
    const cancelled = await service.transitionOrder(order.id, "cancelled");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.statusHistory).toHaveLength(2);
    expect((await store.read()).inventory).toEqual({ p011: 2 });
  });

  it("lặp tới đúng trạng thái: trả đơn hiện tại, không trừ kho lần hai, không thêm lịch sử", async () => {
    const order = await place([{ productId: "p011", quantity: 1 }]);
    const first = await service.transitionOrder(order.id, "confirmed");
    const before = await store.read();
    const again = await service.transitionOrder(order.id, "confirmed", {
      trackingCode: "ABC",
      expectedDeliveryDate: "2026-12-01",
    });
    expect(again).toEqual(first);
    expect(await store.read()).toEqual(before);
    expect(before.inventory.p011).toBe(2);

    const other = await place([{ productId: "p010", quantity: 1 }]);
    await service.transitionOrder(other.id, "cancelled");
    const cancelledAgain = await service.transitionOrder(other.id, "cancelled");
    expect(cancelledAgain.statusHistory).toHaveLength(2);
  });

  it.each([
    ["pending", "delivered"],
    ["cancelled", "confirmed"],
    ["confirmed", "cancelled"],
  ] as const)("sai bước %s -> %s: 409, dữ liệu không đổi, không log", async (from, to) => {
    const order = await place([{ productId: "p011", quantity: 1 }]);
    if (from === "confirmed") await service.transitionOrder(order.id, "confirmed");
    if (from === "cancelled") await service.transitionOrder(order.id, "cancelled");
    const before = await store.read();
    const error = await expectOrderError(
      service.transitionOrder(order.id, to),
      "INVALID_STATUS_TRANSITION",
    );
    expect(error.httpStatus).toBe(409);
    expect(await store.read()).toEqual(before);
    expect(logs).toEqual([]);
  });

  it("không tìm thấy đơn: 404 ORDER_NOT_FOUND", async () => {
    const error = await expectOrderError(
      service.transitionOrder("SL-NOPE", "confirmed"),
      "ORDER_NOT_FOUND",
    );
    expect(error.httpStatus).toBe(404);
    expect(logs).toEqual([]);
  });

  it("sản phẩm không còn trong catalog: PRODUCT_NOT_FOUND, không ghi, không log", async () => {
    const order = await place([{ productId: "p011", quantity: 1 }]);
    const broken = createOrderService({
      store,
      now: () => FIXED_DATE,
      findProduct: () => undefined,
      logEvent: (name, fields) => logs.push({ name, fields }),
    });
    const before = await store.read();
    await expectOrderError(broken.transitionOrder(order.id, "confirmed"), "PRODUCT_NOT_FOUND");
    expect(await store.read()).toEqual(before);
    expect(logs).toEqual([]);
  });

  it("hoàn tất chuỗi xác nhận -> giao: đủ lịch sử, tồn chỉ trừ một lần", async () => {
    const order = await place([{ productId: "p011", quantity: 2 }]);
    await service.transitionOrder(order.id, "confirmed");
    await service.transitionOrder(order.id, "shipping");
    const delivered = await service.transitionOrder(order.id, "delivered");
    expect(delivered.statusHistory.map((h) => h.status)).toEqual([
      "pending",
      "confirmed",
      "shipping",
      "delivered",
    ]);
    expect((await store.read()).inventory.p011).toBe(1);
  });

  it("giao hàng kèm vận đơn: lưu vào store, giao lặp giữ nguyên giá trị cũ", async () => {
    const order = await place([{ productId: "p011", quantity: 1 }]);
    await service.transitionOrder(order.id, "confirmed");
    const shipped = await service.transitionOrder(order.id, "shipping", {
      trackingCode: "  GHN123  ",
      expectedDeliveryDate: "2099-01-01",
    });
    expect(shipped.trackingCode).toBe("GHN123");
    expect(shipped.expectedDeliveryDate).toBe("2099-01-01");
    const stored = await store.read();
    expect(stored.orders[0]).toEqual(shipped);

    const again = await service.transitionOrder(order.id, "shipping", {
      trackingCode: "B2",
      expectedDeliveryDate: "hỏng",
    });
    expect(again).toEqual(shipped);
    expect(await store.read()).toEqual(stored);
    expect(logs).toEqual([]);
  });

  it("giao hàng sai vận đơn: 400, đơn vẫn confirmed, store không đổi", async () => {
    const order = await place([{ productId: "p011", quantity: 1 }]);
    await service.transitionOrder(order.id, "confirmed");
    const before = await store.read();
    const error = await expectOrderError(
      service.transitionOrder(order.id, "shipping", {
        trackingCode: "x".repeat(51),
        expectedDeliveryDate: "2026-02-30",
      }),
      "VALIDATION_ERROR",
    );
    expect(Object.keys(error.details ?? {}).sort()).toEqual([
      "expectedDeliveryDate",
      "trackingCode",
    ]);
    expect(await store.read()).toEqual(before);
    expect(logs).toEqual([]);
  });

  it("vận đơn ở bước sai: 400, không trừ kho", async () => {
    const order = await place([{ productId: "p011", quantity: 1 }]);
    const before = await store.read();
    await expectOrderError(
      service.transitionOrder(order.id, "confirmed", { trackingCode: "A" }),
      "VALIDATION_ERROR",
    );
    expect(await store.read()).toEqual(before);
  });

  it("cancelByCustomer vẫn 409 khi hủy lặp (khác đường nhân viên)", async () => {
    const order = await place([{ productId: "p011", quantity: 1 }]);
    await service.transitionOrder(order.id, "cancelled");
    await expectOrderError(service.cancelByCustomer(order.id), "INVALID_STATUS_TRANSITION");
  });
});
