// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signToken, verifyToken } from "@/features/access/signed-token";
import type { Order, OrderStatus } from "@/features/orders/types";
import { GET, POST } from "./route";

const SECRET = "s".repeat(32);

const cookieValue = vi.hoisted(() => ({
  value: undefined as string | undefined,
  staffValue: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === "sl_own" && cookieValue.value !== undefined) {
        return { name, value: cookieValue.value };
      }
      if (name === "sl_staff" && cookieValue.staffValue !== undefined) {
        return { name, value: cookieValue.staffValue };
      }
      return undefined;
    },
  }),
}));

// Thay orderService (ghi file) bằng bản dùng store trong bộ nhớ.
vi.mock("@/features/orders/server", async () => {
  const { createOrderService } = await import("@/features/orders/order-service");
  const { createInMemoryStoreGateway } = await import("@/features/store/in-memory-store");
  const testStore = createInMemoryStoreGateway();
  return {
    orderService: createOrderService({ store: testStore }),
    testStore,
  };
});

async function getTestStore() {
  const mod = (await import("@/features/orders/server")) as unknown as {
    testStore: import("@/features/store/store-gateway").StoreGateway;
  };
  return mod.testStore;
}

const listRequest = (query = "") => new Request(`http://localhost/api/orders${query}`);

const postOrder = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const validBody = {
  customer: {
    fullName: "Phạm Minh D",
    phone: "0356789012",
    address: "99 Hai Bà Trưng, Huế",
  },
  shippingMethod: "express",
  paymentMethod: "bank_transfer",
  items: [{ productId: "p006", quantity: 1 }],
};

const setCookie = (response: Response) => response.headers.get("set-cookie") ?? "";
const tokenOf = (response: Response) => setCookie(response).split(";")[0].slice("sl_own=".length);
function ownedIds(response: Response): string[] {
  const verified = verifyToken(tokenOf(response), SECRET, "own", Date.now());
  if (!verified.ok || verified.payload.purpose !== "own") throw new Error("cookie không hợp lệ");
  return verified.payload.orderIds;
}

describe("POST /api/orders", () => {
  beforeEach(() => {
    vi.stubEnv("STAFF_PASSWORD", "mat-khau");
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("TRUSTED_PROXY_HOPS", "");
    vi.stubEnv("COOKIE_SECURE", "");
    cookieValue.value = undefined;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("201 - tạo đơn hàng thành công", async () => {
    const response = await postOrder(validBody);
    expect(response.status).toBe(201);
    const order = await response.json();
    expect(order).toMatchObject({
      status: "pending",
      subtotal: 450_000,
      shippingFee: 60_000,
    });
  });

  it("201 - đơn mang source web và statusHistory, không có internalNotes", async () => {
    const response = await postOrder(validBody);
    expect(response.status).toBe(201);
    const order = await response.json();
    expect(order.source).toBe("web");
    expect(order.statusHistory).toEqual([{ status: "pending", at: order.createdAt }]);
    expect(order).not.toHaveProperty("internalNotes");
  });

  it("cấp sl_own chứa Mã đơn mới, đúng thuộc tính, hạn 30 ngày", async () => {
    const before = Date.now();
    const response = await postOrder(validBody);
    const order = await response.json();
    const cookie = setCookie(response);
    expect(cookie).toMatch(/^sl_own=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Secure/i);
    expect(ownedIds(response)).toEqual([order.id]);

    const verified = verifyToken(tokenOf(response), SECRET, "own", Date.now());
    expect(verified.ok).toBe(true);
    const payload = verified.ok ? verified.payload : undefined;
    expect(payload?.purpose).toBe("own");
    expect(payload?.exp).toBeGreaterThanOrEqual(before + 2_592_000_000);
    expect(payload?.exp).toBeLessThanOrEqual(Date.now() + 2_592_000_000);
  });

  it("thuộc tính Secure theo COOKIE_SECURE", async () => {
    vi.stubEnv("COOKIE_SECURE", "true");
    expect(setCookie(await postOrder(validBody))).toMatch(/Secure/i);
  });

  it("gộp với sl_own cũ hợp lệ", async () => {
    cookieValue.value = signToken(
      { purpose: "own", exp: Date.now() + 100_000, orderIds: ["SL-OLD"] },
      SECRET,
    );
    const response = await postOrder(validBody);
    const order = await response.json();
    expect(ownedIds(response)).toEqual(["SL-OLD", order.id]);
  });

  it("đầy 20 thì bỏ id cũ nhất", async () => {
    const full = Array.from({ length: 20 }, (_, i) => `SL-OLD-${i}`);
    cookieValue.value = signToken(
      { purpose: "own", exp: Date.now() + 100_000, orderIds: full },
      SECRET,
    );
    const response = await postOrder(validBody);
    const ids = ownedIds(response);
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe("SL-OLD-1");
    expect(ids[19]).toBe((await response.json()).id);
  });

  it("sl_own cũ hết hạn hoặc sai chữ ký: chỉ chứa đơn vừa đặt", async () => {
    cookieValue.value = signToken({ purpose: "own", exp: Date.now() - 1, orderIds: ["A"] }, SECRET);
    let response = await postOrder(validBody);
    expect(ownedIds(response)).toEqual([(await response.json()).id]);

    cookieValue.value = signToken(
      { purpose: "own", exp: Date.now() + 100_000, orderIds: ["A"] },
      "x".repeat(32),
    );
    response = await postOrder(validBody);
    expect(ownedIds(response)).toEqual([(await response.json()).id]);
  });

  it("chưa cấu hình: vẫn 201, không Set-Cookie, log cảnh báo không PII", async () => {
    vi.stubEnv("SESSION_SECRET", "ngan");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await postOrder(validBody);
    expect(response.status).toBe(201);
    const order = await response.json();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(JSON.parse(line)).toEqual({
      event: "order_placed_unproven",
      code: "SESSION_NOT_CONFIGURED",
    });
    expect(line).not.toContain(order.id);
    expect(line).not.toContain("0356789012");
  });

  it("thiếu STAFF_PASSWORD cũng coi là chưa cấu hình", async () => {
    vi.stubEnv("STAFF_PASSWORD", "");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await postOrder(validBody);
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("400 - sai Content-Type, không cookie", async () => {
    const response = await postOrder(validBody, { "Content-Type": "text/plain" });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("400 - Origin lệch Host, không ghi đơn, không cookie", async () => {
    const response = await postOrder(validBody, {
      Origin: "http://evil.test",
      Host: "localhost",
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("400 - body không phải JSON", async () => {
    const response = await postOrder("{oops");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Body phải là JSON hợp lệ");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("400 - dữ liệu không hợp lệ kèm details, không cookie", async () => {
    const response = await postOrder({
      ...validBody,
      customer: { ...validBody.customer, phone: "1" },
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.details).toHaveProperty(["customer.phone"]);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("409 - vượt quá tồn kho, không cookie", async () => {
    const response = await postOrder({
      ...validBody,
      items: [{ productId: "p004", quantity: 1 }],
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("INSUFFICIENT_STOCK");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("GET /api/orders (chỉ nhân viên)", () => {
  const UNAUTHORIZED_MESSAGE = "Bạn cần đăng nhập để thực hiện thao tác này";
  const staffToken = (exp = Date.now() + 60_000, secret = SECRET) =>
    signToken({ purpose: "staff", exp }, secret);
  const ownToken = (exp = Date.now() + 60_000) =>
    signToken({ purpose: "own", exp, orderIds: ["SL-X"] }, SECRET);

  beforeEach(async () => {
    vi.stubEnv("STAFF_PASSWORD", "mat-khau");
    vi.stubEnv("SESSION_SECRET", SECRET);
    cookieValue.value = undefined;
    cookieValue.staffValue = undefined;
    await postOrder(validBody);
    cookieValue.value = undefined;
  });
  afterEach(() => {
    cookieValue.staffValue = undefined;
    vi.unstubAllEnvs();
  });

  async function expectUnauthorized(response: Response) {
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    const text = await response.text();
    const body = JSON.parse(text);
    expect(body).toEqual({ error: { code: "UNAUTHORIZED", message: UNAUTHORIZED_MESSAGE } });
    expect(body).not.toHaveProperty("orders");
    for (const pii of [validBody.customer.fullName, validBody.customer.phone, "Hai Bà Trưng"]) {
      expect(text).not.toContain(pii);
    }
  }

  it("nhân viên: 200 { orders } đầy đủ, mỗi đơn có khóa internalNotes", async () => {
    cookieValue.staffValue = staffToken();
    const response = await GET(listRequest());
    expect(response.status).toBe(200);
    const { orders } = await response.json();
    expect(orders.length).toBeGreaterThan(0);
    for (const order of orders) expect(order).toHaveProperty("internalNotes");
    expect(orders[0].customer.phone).toBeDefined();
  });

  it("không cookie: 401 UNAUTHORIZED, không PII, không khóa orders", async () => {
    await expectUnauthorized(await GET(listRequest()));
  });

  it("bị từ chối thì không đọc store (listStaffOrders không được gọi)", async () => {
    const { orderService } = await import("@/features/orders/server");
    const spy = vi.spyOn(orderService, "listStaffOrders");
    await expectUnauthorized(await GET(listRequest()));
    cookieValue.value = ownToken();
    await expectUnauthorized(await GET(listRequest()));
    cookieValue.staffValue = "rac";
    await expectUnauthorized(await GET(listRequest()));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("không phiên: 401 kể cả khi status hỏng, không đọc store", async () => {
    const { orderService } = await import("@/features/orders/server");
    const spy = vi.spyOn(orderService, "listStaffOrders");
    for (const query of ["?status=foo", "?status=", "?status=pending&status=all"]) {
      await expectUnauthorized(await GET(listRequest(query)));
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  describe("lọc, sắp xếp, đếm", () => {
    const base = (id: string, status: OrderStatus, createdAt: string): Order => ({
      id,
      status,
      createdAt,
      updatedAt: createdAt,
      customer: { fullName: "Khách", phone: "0356789012", address: "x" },
      shippingMethod: "standard",
      paymentMethod: "cod",
      items: [],
      subtotal: 0,
      shippingFee: 0,
      total: 0,
      source: "web",
      statusHistory: [{ status: "pending", at: createdAt }],
      internalNotes: [{ id: "n1", text: "ghi chú", createdAt }],
    });

    async function seed(orders: unknown[]) {
      const store = await getTestStore();
      await store.update((data) => ({
        data: { ...data, orders: orders as Order[] },
        result: undefined,
      }));
    }
    const list = async (query = "") => {
      cookieValue.staffValue = staffToken();
      return GET(listRequest(query));
    };
    const idsOf = (body: { orders: Order[] }) => body.orders.map((o) => o.id);

    const mixed = () => [
      base("D", "delivered", "2026-11-01T00:00:00.000Z"),
      base("P2", "pending", "2026-11-05T00:00:00.000Z"),
      base("S", "shipping", "2026-11-03T00:00:00.000Z"),
      base("C", "cancelled", "2026-11-02T00:00:00.000Z"),
      base("P1", "pending", "2026-11-04T00:00:00.000Z"),
      base("F", "confirmed", "2026-11-06T00:00:00.000Z"),
    ];
    const mixedCounts = {
      active: 4,
      pending: 2,
      confirmed: 1,
      shipping: 1,
      delivered: 1,
      cancelled: 1,
      all: 6,
    };

    it("mặc định = active, cũ nhất trước, counts đủ bảy khóa, giữ internalNotes", async () => {
      await seed(mixed());
      const response = await list();
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(idsOf(body)).toEqual(["S", "P1", "P2", "F"]);
      expect(body.counts).toEqual(mixedCounts);
      for (const order of body.orders) expect(order.internalNotes).toHaveLength(1);
    });

    it("?status=active giống mặc định", async () => {
      await seed(mixed());
      expect(idsOf(await (await list("?status=active")).json())).toEqual(["S", "P1", "P2", "F"]);
    });

    it("từng trạng thái: chỉ đơn đó, counts vẫn toàn bộ", async () => {
      await seed(mixed());
      const body = await (await list("?status=shipping")).json();
      expect(idsOf(body)).toEqual(["S"]);
      expect(body.counts).toEqual(mixedCounts);
      expect(idsOf(await (await list("?status=cancelled")).json())).toEqual(["C"]);
      expect(idsOf(await (await list("?status=delivered")).json())).toEqual(["D"]);
    });

    it("all: mọi đơn, cũ nhất trước, counts.all = số đơn", async () => {
      await seed(mixed());
      const body = await (await list("?status=all")).json();
      expect(idsOf(body)).toEqual(["D", "C", "S", "P1", "P2", "F"]);
      expect(body.counts.all).toBe(6);
    });

    it("cùng createdAt: xếp theo id tăng dần", async () => {
      const at = "2026-11-01T00:00:00.000Z";
      await seed([base("B", "pending", at), base("A", "pending", at), base("C", "pending", at)]);
      expect(idsOf(await (await list()).json())).toEqual(["A", "B", "C"]);
    });

    it("store rỗng: 200 { orders: [], counts } toàn 0", async () => {
      await seed([]);
      const body = await (await list()).json();
      expect(body.orders).toEqual([]);
      expect(Object.values(body.counts)).toEqual([0, 0, 0, 0, 0, 0, 0]);
      expect(Object.keys(body.counts)).toHaveLength(7);
    });

    it.each([
      "?status=foo",
      "?status=",
      "?status=Pending",
      "?status=pending&status=all",
      "?status=all&status=all",
    ])("%s: 400 VALIDATION_ERROR có details.status, không đọc store", async (query) => {
      const { orderService } = await import("@/features/orders/server");
      const spy = vi.spyOn(orderService, "listStaffOrders");
      const response = await list(query);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.details).toHaveProperty("status");
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("đơn cũ thiếu source/statusHistory: xuất hiện, source = web, lịch sử chuẩn hóa", async () => {
      const legacy: Record<string, unknown> = {
        ...base("OLD", "pending", "2026-10-01T00:00:00.000Z"),
      };
      delete legacy.source;
      delete legacy.statusHistory;
      await seed([legacy]);
      const body = await (await list()).json();
      expect(idsOf(body)).toEqual(["OLD"]);
      expect(body.orders[0].source).toBe("web");
      expect(body.orders[0].statusHistory).toEqual([
        { status: "pending", at: "2026-10-01T00:00:00.000Z" },
      ]);
    });

    it("hiệu năng: 500 đơn, status=active, dưới 1 giây", async () => {
      const statuses: OrderStatus[] = [
        "pending",
        "confirmed",
        "shipping",
        "delivered",
        "cancelled",
      ];
      await seed(
        Array.from({ length: 500 }, (_, i) =>
          base(
            `SL-${String(i).padStart(4, "0")}`,
            statuses[i % 5],
            new Date(Date.UTC(2026, 0, 1) + (500 - i) * 60_000).toISOString(),
          ),
        ),
      );
      const started = performance.now();
      const response = await list("?status=active");
      const elapsed = performance.now() - started;
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.orders).toHaveLength(300);
      expect(body.counts.all).toBe(500);
      expect(elapsed).toBeLessThan(1000);
    });
  });

  it("chỉ có sl_own: 401", async () => {
    cookieValue.value = ownToken();
    await expectUnauthorized(await GET(listRequest()));
  });

  it("sl_staff hết hạn, sai chữ ký, sai mục đích, rác: 401, không 500", async () => {
    for (const value of [
      staffToken(Date.now() - 1),
      staffToken(undefined, "x".repeat(32)),
      ownToken(),
      "rac",
      "x".repeat(300),
    ]) {
      cookieValue.staffValue = value;
      await expectUnauthorized(await GET(listRequest()));
    }
  });

  it("chưa cấu hình: 401 dù có cookie nhân viên", async () => {
    cookieValue.staffValue = staffToken();
    vi.stubEnv("SESSION_SECRET", "ngan");
    await expectUnauthorized(await GET(listRequest()));
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("STAFF_PASSWORD", "");
    await expectUnauthorized(await GET(listRequest()));
  });
});

describe("POST /api/orders: dữ liệu trả Khách không có internalNotes", () => {
  it("kể cả khi người gọi có sl_staff", async () => {
    vi.stubEnv("STAFF_PASSWORD", "mat-khau");
    vi.stubEnv("SESSION_SECRET", SECRET);
    cookieValue.staffValue = signToken({ purpose: "staff", exp: Date.now() + 60_000 }, SECRET);
    const response = await postOrder(validBody);
    expect(response.status).toBe(201);
    const text = await response.text();
    expect(JSON.parse(text)).not.toHaveProperty("internalNotes");
    expect(text).not.toContain("internalNotes");
    cookieValue.staffValue = undefined;
    vi.unstubAllEnvs();
  });
});
