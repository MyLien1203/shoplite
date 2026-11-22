// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "@/features/access/signed-token";
import type { StoreGateway } from "@/features/store/store-gateway";
import { POST } from "./route";

const SECRET = "s".repeat(32);
const JSON_CT = { "Content-Type": "application/json" };
const ID_A = "SL-20261021-AAAAAA";
const ID_B = "SL-20261021-BBBBBB";

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "sl_staff" && jar.value !== undefined ? { name, value: jar.value } : undefined,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const ids = vi.hoisted(() => ({ next: [] as string[] }));
vi.mock("@/features/orders/server", async () => {
  const { createOrderService: create } = await import("@/features/orders/order-service");
  const { createInMemoryStoreGateway: createStore } =
    await import("@/features/store/in-memory-store");
  const store = createStore();
  return {
    orderService: create({
      store,
      logEvent: () => {},
      generateId: () => ids.next.shift() ?? "SL-20261021-FFFFFF",
    }),
    testStore: store,
  };
});

async function testStore(): Promise<StoreGateway> {
  const mod = (await import("@/features/orders/server")) as unknown as { testStore: StoreGateway };
  return mod.testStore;
}

async function seed(id: string, productId = "p011", quantity = 2) {
  const { orderService } = await import("@/features/orders/server");
  ids.next.push(id);
  await orderService.placeOrder({
    customer: { fullName: "Nguyễn Văn Test", phone: "0912345678", address: "12 Nguyễn Huệ" },
    shippingMethod: "standard",
    paymentMethod: "cod",
    items: [{ productId, quantity }],
  });
}

const staffCookie = () => signToken({ purpose: "staff", exp: Date.now() + 60_000 }, SECRET);

function transition(
  id: string,
  body: unknown,
  headers: Record<string, string> = JSON_CT,
): Promise<Response> {
  return POST(
    new Request(`http://shop.test/api/staff/orders/${id}/transition`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) } as Parameters<typeof POST>[1],
  );
}

describe("POST /api/staff/orders/:id/transition", () => {
  beforeEach(async () => {
    vi.stubEnv("STAFF_PASSWORD", "mat-khau");
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("TRUSTED_PROXY_HOPS", "");
    jar.value = staffCookie();
    const store = await testStore();
    await store.update((data) => ({
      data: { ...data, orders: [], inventory: {} },
      result: undefined,
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("200 - xác nhận trả đơn đầy đủ và trừ tồn thực", async () => {
    await seed(ID_A);
    const response = await transition(ID_A, { target: "confirmed" });
    expect(response.status).toBe(200);
    const order = await response.json();
    expect(order.id).toBe(ID_A);
    expect(order.status).toBe("confirmed");
    expect(order.customer.phone).toBe("0912345678");
    expect(order.statusHistory).toHaveLength(2);
    expect((await (await testStore()).read()).inventory.p011).toBe(1);
  });

  it("200 - lặp tới trạng thái hiện tại không trừ kho lần hai", async () => {
    await seed(ID_A);
    await transition(ID_A, { target: "confirmed" });
    const response = await transition(ID_A, { target: "confirmed" });
    expect(response.status).toBe(200);
    expect((await response.json()).statusHistory).toHaveLength(2);
    expect((await (await testStore()).read()).inventory.p011).toBe(1);
  });

  it("200 - hủy không đổi tồn", async () => {
    await seed(ID_A);
    const response = await transition(ID_A, { target: "cancelled" });
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("cancelled");
    expect((await (await testStore()).read()).inventory).toEqual({});
  });

  it("409 INSUFFICIENT_STOCK - đơn giữ pending", async () => {
    await seed(ID_A, "p011", 3);
    await seed(ID_B, "p011", 3);
    expect((await transition(ID_A, { target: "confirmed" })).status).toBe(200);
    const response = await transition(ID_B, { target: "confirmed" });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("INSUFFICIENT_STOCK");
    const { orders, inventory } = await (await testStore()).read();
    expect(orders.find((o) => o.id === ID_B)?.status).toBe("pending");
    expect(inventory.p011).toBe(0);
  });

  it("409 INVALID_STATUS_TRANSITION - pending -> delivered", async () => {
    await seed(ID_A);
    const response = await transition(ID_A, { target: "delivered" });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("404 - id lạ", async () => {
    const response = await transition("SL-NOPE", { target: "confirmed" });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("ORDER_NOT_FOUND");
  });

  it.each([
    ["thiếu target", {}],
    ['"done"', { target: "done" }],
    ["số", { target: 1 }],
    ["body mảng", ["confirmed"]],
    ["body null", null],
  ])("400 - target sai: %s, đơn không đổi", async (_name, body) => {
    await seed(ID_A);
    const response = await transition(ID_A, body);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.details.target).toEqual(expect.any(String));
    const { orders, inventory } = await (await testStore()).read();
    expect(orders[0].status).toBe("pending");
    expect(inventory).toEqual({});
  });

  it("400 - body không phải JSON", async () => {
    await seed(ID_A);
    const response = await transition(ID_A, "{khong-json");
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("trường thừa bị bỏ qua", async () => {
    await seed(ID_A);
    const response = await transition(ID_A, { target: "confirmed", extra: "XYZ" });
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("XYZ");
  });

  describe("Story 2.5: vận đơn và ngày giao", () => {
    async function seedConfirmed() {
      await seed(ID_A);
      expect((await transition(ID_A, { target: "confirmed" })).status).toBe(200);
    }
    async function stored() {
      return (await (await testStore()).read()).orders[0];
    }

    it("200 - giao kèm vận đơn (trim) và ngày giao", async () => {
      await seedConfirmed();
      const response = await transition(ID_A, {
        target: "shipping",
        trackingCode: "  GHN123  ",
        expectedDeliveryDate: "2099-01-01",
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.status).toBe("shipping");
      expect(json.trackingCode).toBe("GHN123");
      expect(json.expectedDeliveryDate).toBe("2099-01-01");
      expect(json.statusHistory).toHaveLength(3);
      expect(await stored()).toMatchObject({ trackingCode: "GHN123" });
    });

    it("200 - giao không trường hoặc chuỗi rỗng: không có khóa vận đơn", async () => {
      await seedConfirmed();
      const response = await transition(ID_A, {
        target: "shipping",
        trackingCode: "  ",
        expectedDeliveryDate: "",
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect("trackingCode" in json).toBe(false);
      expect("expectedDeliveryDate" in json).toBe(false);
    });

    it.each([
      ["mã 51 ký tự", { trackingCode: "x".repeat(51) }, "trackingCode"],
      ["mã có ký tự cấm", { trackingCode: "<b>" }, "trackingCode"],
      ["ngày sai định dạng", { expectedDeliveryDate: "25/11/2026" }, "expectedDeliveryDate"],
      ["ngày không có thật", { expectedDeliveryDate: "2099-02-30" }, "expectedDeliveryDate"],
      ["ngày trước ngày tạo", { expectedDeliveryDate: "2000-01-01" }, "expectedDeliveryDate"],
    ])("400 - %s, đơn vẫn confirmed", async (_n, extra, key) => {
      await seedConfirmed();
      const before = await stored();
      const response = await transition(ID_A, { target: "shipping", ...extra });
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
      expect(json.error.details[key]).toEqual(expect.any(String));
      expect(await stored()).toEqual(before);
    });

    it.each([
      ["trackingCode số", { trackingCode: 123 }, "trackingCode"],
      ["trackingCode null", { trackingCode: null }, "trackingCode"],
      ["ngày là mảng", { expectedDeliveryDate: ["x"] }, "expectedDeliveryDate"],
    ])("400 - kiểu sai (%s) theo khóa, không đụng store", async (_n, extra, key) => {
      await seedConfirmed();
      const before = await stored();
      const response = await transition(ID_A, { target: "shipping", ...extra });
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(Object.keys(json.error.details)).toEqual([key]);
      expect(await stored()).toEqual(before);
    });

    it("400 - vận đơn ở bước sai (kể cả rỗng), không trừ kho", async () => {
      await seed(ID_A);
      for (const extra of [{ trackingCode: "A" }, { expectedDeliveryDate: "" }]) {
        const response = await transition(ID_A, { target: "confirmed", ...extra });
        expect(response.status).toBe(400);
        expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
      }
      const { orders, inventory } = await (await testStore()).read();
      expect(orders[0].status).toBe("pending");
      expect(inventory).toEqual({});
    });

    it("409 - sai bảng chuyển kèm trường vẫn là 409", async () => {
      await seed(ID_A);
      const response = await transition(ID_A, { target: "shipping", trackingCode: "A" });
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("INVALID_STATUS_TRANSITION");
    });

    it("200 - giao lặp giữ nguyên vận đơn cũ, không thêm lịch sử", async () => {
      await seedConfirmed();
      await transition(ID_A, { target: "shipping", trackingCode: "A1" });
      const response = await transition(ID_A, {
        target: "shipping",
        trackingCode: "B2",
        expectedDeliveryDate: "hỏng",
      });
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.trackingCode).toBe("A1");
      expect(json.statusHistory).toHaveLength(3);
    });

    it("200 - giao xong delivered; delivered rời là 409", async () => {
      await seedConfirmed();
      await transition(ID_A, { target: "shipping", trackingCode: "A1" });
      const delivered = await transition(ID_A, { target: "delivered" });
      expect(delivered.status).toBe(200);
      expect((await delivered.json()).status).toBe("delivered");
      const back = await transition(ID_A, { target: "shipping" });
      expect(back.status).toBe(409);
    });

    it("401 vẫn đứng trước validate vận đơn", async () => {
      await seedConfirmed();
      jar.value = undefined;
      const response = await transition(ID_A, { target: "shipping", trackingCode: 123 });
      expect(response.status).toBe(401);
    });
  });

  it("thứ tự: CSRF (400) trước phiên (401), phiên (401) trước validate body (400)", async () => {
    await seed(ID_A);
    jar.value = undefined;
    const csrf = await transition(ID_A, { target: "confirmed" }, { "Content-Type": "text/plain" });
    expect(csrf.status).toBe(400);
    const session = await transition(ID_A, { target: "done" });
    expect(session.status).toBe(401);
  });

  it("401 - không cookie, không đụng store", async () => {
    await seed(ID_A);
    jar.value = undefined;
    const response = await transition(ID_A, { target: "confirmed" });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    const { orders, inventory } = await (await testStore()).read();
    expect(orders[0].status).toBe("pending");
    expect(inventory).toEqual({});
  });

  it("400 - sai Content-Type, không đụng store", async () => {
    await seed(ID_A);
    const response = await transition(
      ID_A,
      { target: "confirmed" },
      { "Content-Type": "text/plain" },
    );
    expect(response.status).toBe(400);
    expect((await (await testStore()).read()).orders[0].status).toBe("pending");
  });

  it("400 - Origin lệch Host, không đụng store", async () => {
    await seed(ID_A);
    const response = await transition(
      ID_A,
      { target: "confirmed" },
      { ...JSON_CT, Host: "shop.test", Origin: "http://evil.test" },
    );
    expect(response.status).toBe(400);
    expect((await (await testStore()).read()).orders[0].status).toBe("pending");
  });
});
