// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "@/features/access/signed-token";
import type { StoreGateway } from "@/features/store/store-gateway";
import { updateOrder } from "@/features/store/update-order";
import { GET, PATCH } from "./route";

const SECRET = "s".repeat(32);
const NOT_FOUND = "Không tìm thấy đơn hàng. Kiểm tra lại Mã đơn và số điện thoại.";
const REAL_ID = "SL-20261021-AAAAAA";
const OTHER_ID = "SL-20261021-BBBBBB";

const jar = vi.hoisted(() => ({ values: {} as Record<string, string | undefined> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.values[name] !== undefined ? { name, value: jar.values[name] } : undefined,
  }),
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
      generateId: () => ids.next.shift() ?? "SL-20261021-FFFFFF",
    }),
    testStore: store,
  };
});

async function seed(id: string) {
  const { orderService } = await import("@/features/orders/server");
  ids.next.push(id);
  await orderService.placeOrder({
    customer: { fullName: "Nguyễn Văn Test", phone: "0912345678", address: "12 Nguyễn Huệ" },
    shippingMethod: "standard",
    paymentMethod: "cod",
    items: [{ productId: "p010", quantity: 1 }],
  });
}

const get = (id: string) =>
  GET(new Request(`http://shop.test/api/orders/${id}`), {
    params: Promise.resolve({ id }),
  } as Parameters<typeof GET>[1]);

const own = (orderIds: string[], exp = Date.now() + 60_000, secret = SECRET) =>
  signToken({ purpose: "own", exp, orderIds }, secret);
const staff = (exp = Date.now() + 60_000) => signToken({ purpose: "staff", exp }, SECRET);

describe("GET /api/orders/:id", () => {
  beforeEach(async () => {
    vi.stubEnv("STAFF_PASSWORD", "mat-khau");
    vi.stubEnv("SESSION_SECRET", SECRET);
    jar.values = {};
    const { orderService } = await import("@/features/orders/server");
    if ((await orderService.listOrders()).length === 0) await seed(REAL_ID);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function expectStrangerNotFound(id: string) {
    const response = await get(id);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("ORDER_NOT_FOUND");
    expect(body.error.message).toBe(NOT_FOUND);
    expect(JSON.stringify(body)).not.toContain(id);
    return body;
  }

  it("chủ đơn: 200 CustomerOrderView, không internalNotes", async () => {
    jar.values.sl_own = own([REAL_ID]);
    const response = await get(REAL_ID);
    expect(response.status).toBe(200);
    const order = await response.json();
    expect(order.id).toBe(REAL_ID);
    expect(order.customer.fullName).toBe("Nguyễn Văn Test");
    expect(order).not.toHaveProperty("internalNotes");
  });

  it("nhân viên: 200, cũng không internalNotes", async () => {
    jar.values.sl_staff = staff();
    const response = await get(REAL_ID);
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("internalNotes");
  });

  it("đơn có internalNotes trong store: chủ đơn và nhân viên đều không thấy ghi chú", async () => {
    const NOTE = "GHI-CHU-NOI-BO-GET";
    const { testStore } = (await import("@/features/orders/server")) as unknown as {
      testStore: StoreGateway;
    };
    await testStore.update((data) => ({
      data: updateOrder(data, REAL_ID, (o) => ({
        ...o,
        internalNotes: [{ id: "n1", text: NOTE, createdAt: o.createdAt }],
      })).data,
      result: undefined,
    }));
    for (const cookie of [{ sl_own: own([REAL_ID]) }, { sl_staff: staff() }] as Record<
      string,
      string
    >[]) {
      jar.values = cookie;
      const text = await (await get(REAL_ID)).text();
      expect(JSON.parse(text)).not.toHaveProperty("internalNotes");
      expect(text).not.toContain(NOTE);
    }
  });

  it("người lạ: 404 giống hệt cho id có thật và id không tồn tại", async () => {
    const real = await expectStrangerNotFound(REAL_ID);
    const missing = await expectStrangerNotFound("SL-20261021-NOPE00");
    expect(real).toEqual(missing);
  });

  it("sl_own không chứa id: như người lạ", async () => {
    jar.values.sl_own = own([OTHER_ID]);
    await expectStrangerNotFound(REAL_ID);
  });

  it("cookie hết hạn, sai chữ ký, rác: như người lạ, không 500", async () => {
    jar.values.sl_own = own([REAL_ID], Date.now() - 1);
    await expectStrangerNotFound(REAL_ID);
    jar.values.sl_own = own([REAL_ID], undefined, "x".repeat(32));
    await expectStrangerNotFound(REAL_ID);
    jar.values.sl_own = "rac";
    jar.values.sl_staff = staff(Date.now() - 1);
    await expectStrangerNotFound(REAL_ID);
    jar.values.sl_staff = "x".repeat(300);
    await expectStrangerNotFound(REAL_ID);
  });

  it("chưa cấu hình: như người lạ dù có cookie", async () => {
    jar.values.sl_own = own([REAL_ID]);
    jar.values.sl_staff = staff();
    vi.stubEnv("SESSION_SECRET", "ngan");
    await expectStrangerNotFound(REAL_ID);
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("STAFF_PASSWORD", "");
    await expectStrangerNotFound(REAL_ID);
  });

  it("có quyền nhưng đơn không tồn tại: 404 ORDER_NOT_FOUND", async () => {
    jar.values.sl_staff = staff();
    const response = await get("SL-20261021-NOPE00");
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("ORDER_NOT_FOUND");
  });
});

describe("PATCH /api/orders/:id", () => {
  const CANCEL_MESSAGE = "Chỉ có thể hủy đơn hàng đang ở trạng thái Chờ xác nhận";
  let counter = 0;

  const patch = (
    id: string,
    body: unknown = { status: "cancelled" },
    headers: Record<string, string> = { "Content-Type": "application/json" },
  ) =>
    PATCH(
      new Request(`http://shop.test/api/orders/${id}`, {
        method: "PATCH",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) } as Parameters<typeof PATCH>[1],
    );

  async function getStore() {
    const { testStore } = (await import("@/features/orders/server")) as unknown as {
      testStore: StoreGateway;
    };
    return testStore;
  }

  async function stored(id: string) {
    const orders = (await (await getStore()).read()).orders;
    const order = orders.find((o) => o.id === id);
    if (!order) throw new Error(`thiếu đơn ${id}`);
    return order;
  }

  async function freshOrder() {
    const id = `SL-20261021-P${String(++counter).padStart(5, "0")}`;
    await seed(id);
    await (
      await getStore()
    ).update((data) => ({
      data: updateOrder(data, id, (o) => ({
        ...o,
        internalNotes: [{ id: "n1", text: "GHI-CHU-NOI-BO", createdAt: o.createdAt }],
      })).data,
      result: undefined,
    }));
    return id;
  }

  async function setStatus(id: string, status: "confirmed" | "shipping" | "delivered") {
    await (
      await getStore()
    ).update((data) => ({
      data: updateOrder(data, id, (o) => ({ ...o, status })).data,
      result: undefined,
    }));
  }

  async function expectStrangerNotFound(id: string, body?: unknown) {
    const response = await patch(id, body);
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error.code).toBe("ORDER_NOT_FOUND");
    expect(json.error.message).toBe(NOT_FOUND);
    expect(JSON.stringify(json)).not.toContain(id);
    return json;
  }

  beforeEach(() => {
    vi.stubEnv("STAFF_PASSWORD", "mat-khau");
    vi.stubEnv("SESSION_SECRET", SECRET);
    jar.values = {};
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("chủ đơn hủy: 200 CustomerOrderView, thêm đúng một mục cancelled", async () => {
    const id = await freshOrder();
    const before = await stored(id);
    jar.values.sl_own = own([id]);
    const response = await patch(id);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("cancelled");
    expect(json).not.toHaveProperty("internalNotes");
    expect(JSON.stringify(json)).not.toContain("GHI-CHU-NOI-BO");
    expect(json.statusHistory).toHaveLength(before.statusHistory.length + 1);
    expect(
      json.statusHistory.filter((h: { status: string }) => h.status === "cancelled"),
    ).toHaveLength(1);
    const after = await stored(id);
    expect(after.status).toBe("cancelled");
    expect(after.internalNotes).toHaveLength(1);
  });

  it("nhân viên hủy: 200, không internalNotes", async () => {
    const id = await freshOrder();
    jar.values.sl_staff = staff();
    const response = await patch(id);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("cancelled");
    expect(json).not.toHaveProperty("internalNotes");
    expect(JSON.stringify(json)).not.toContain("GHI-CHU-NOI-BO");
  });

  it("hủy lại: 409 INVALID_STATUS_TRANSITION, dữ liệu không đổi", async () => {
    const id = await freshOrder();
    jar.values.sl_own = own([id]);
    expect((await patch(id)).status).toBe(200);
    const before = await stored(id);
    const response = await patch(id);
    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error.code).toBe("INVALID_STATUS_TRANSITION");
    expect(json.error.message).toBe(CANCEL_MESSAGE);
    expect(await stored(id)).toEqual(before);
  });

  it.each(["confirmed", "shipping", "delivered"] as const)(
    "đơn %s: 409, dữ liệu không đổi",
    async (status) => {
      const id = await freshOrder();
      await setStatus(id, status);
      jar.values.sl_own = own([id]);
      const before = await stored(id);
      const response = await patch(id);
      expect(response.status).toBe(409);
      expect((await response.json()).error.message).toBe(CANCEL_MESSAGE);
      expect(await stored(id)).toEqual(before);
    },
  );

  it("hai PATCH song song: một 200, một 409, statusHistory chỉ một mục cancelled", async () => {
    const id = await freshOrder();
    jar.values.sl_own = own([id]);
    const responses = await Promise.all([patch(id), patch(id)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const order = await stored(id);
    expect(order.statusHistory.filter((h) => h.status === "cancelled")).toHaveLength(1);
  });

  it("người lạ: 404 giống hệt cho id có thật và không tồn tại, trước khi kiểm body", async () => {
    const id = await freshOrder();
    const real = await expectStrangerNotFound(id);
    const missing = await expectStrangerNotFound("SL-20261021-NOPE00");
    expect(real.error).toEqual(missing.error);
    await expectStrangerNotFound(id, { status: "confirmed" });
    await expectStrangerNotFound(id, "{hong");
    expect((await stored(id)).status).toBe("pending");
  });

  it("sl_own không chứa id, cookie hỏng/hết hạn, chưa cấu hình: như người lạ", async () => {
    const id = await freshOrder();
    jar.values.sl_own = own(["SL-OTHER"]);
    await expectStrangerNotFound(id);
    jar.values.sl_own = own([id], Date.now() - 1);
    await expectStrangerNotFound(id);
    jar.values.sl_own = own([id], undefined, "x".repeat(32));
    await expectStrangerNotFound(id);
    jar.values.sl_own = "rac";
    jar.values.sl_staff = "x".repeat(300);
    await expectStrangerNotFound(id);
    jar.values.sl_own = own([id]);
    jar.values.sl_staff = staff();
    vi.stubEnv("SESSION_SECRET", "ngan");
    await expectStrangerNotFound(id);
    expect((await stored(id)).status).toBe("pending");
  });

  it("nhân viên với id lạ: 404 ORDER_NOT_FOUND của service", async () => {
    jar.values.sl_staff = staff();
    const response = await patch("SL-20261021-NOPE00");
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("ORDER_NOT_FOUND");
  });

  it.each([{ status: "confirmed" }, {}, { status: 1 }, null])(
    "status khác cancelled (%j): 400 VALIDATION_ERROR, dữ liệu không đổi",
    async (body) => {
      const id = await freshOrder();
      jar.values.sl_own = own([id]);
      const response = await patch(id, body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
      expect((await stored(id)).status).toBe("pending");
    },
  );

  it("body JSON hỏng: 400 'Body phải là JSON hợp lệ'", async () => {
    const id = await freshOrder();
    jar.values.sl_own = own([id]);
    const response = await patch(id, "{hong");
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toBe("Body phải là JSON hợp lệ");
    expect((await stored(id)).status).toBe("pending");
  });

  it("CSRF: thiếu Content-Type hoặc Origin lệch Host: 400 kể cả người lạ, không đổi dữ liệu", async () => {
    const id = await freshOrder();
    const noType = await patch(id, { status: "cancelled" }, {});
    expect(noType.status).toBe(400);
    expect((await noType.json()).error.code).toBe("VALIDATION_ERROR");
    jar.values.sl_own = own([id]);
    const badOrigin = await patch(
      id,
      { status: "cancelled" },
      { "Content-Type": "application/json", Origin: "http://evil.test" },
    );
    expect(badOrigin.status).toBe(400);
    expect((await stored(id)).status).toBe("pending");
  });
});
