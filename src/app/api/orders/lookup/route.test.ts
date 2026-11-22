// @vitest-environment node
import type { StoreGateway } from "@/features/store/store-gateway";
import { updateOrder } from "@/features/store/update-order";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signToken, verifyToken } from "@/features/access/signed-token";
import { POST } from "./route";

const SECRET = "s".repeat(32);
const RATE_LIMITED = "Bạn đã thử sai quá nhiều lần. Vui lòng thử lại sau 15 phút.";
const RATE_LIMITER_KEY = Symbol.for("shoplite.access.rateLimiter");
const NOT_FOUND = "Không tìm thấy đơn hàng. Kiểm tra lại Mã đơn và số điện thoại.";

const cookieValue = vi.hoisted(() => ({
  value: undefined as string | undefined,
  staff: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value =
        name === "sl_own" ? cookieValue.value : name === "sl_staff" ? cookieValue.staff : undefined;
      return value !== undefined ? { name, value } : undefined;
    },
  }),
}));

const ids = vi.hoisted(() => ({ next: [] as string[] }));
vi.mock("@/features/orders/server", async () => {
  const { createOrderService: create } = await import("@/features/orders/order-service");
  const { createInMemoryStoreGateway: createStore } =
    await import("@/features/store/in-memory-store");
  const store = createStore();
  return {
    orderService: create({ store, generateId: () => ids.next.shift() ?? "SL-20261021-FFFFFF" }),
    testStore: store,
  };
});

async function seed(id: string, phone: string) {
  const { orderService } = await import("@/features/orders/server");
  ids.next.push(id);
  await orderService.placeOrder({
    customer: { fullName: "Nguyễn Văn Test", phone, address: "12 Nguyễn Huệ, Quận 1" },
    shippingMethod: "standard",
    paymentMethod: "cod",
    items: [{ productId: "p010", quantity: 1 }],
  });
}

function lookup(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("http://shop.test/api/orders/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const setCookie = (response: Response) => response.headers.get("set-cookie") ?? "";
const tokenOf = (response: Response) => setCookie(response).split(";")[0].slice("sl_own=".length);

describe("POST /api/orders/lookup", () => {
  beforeEach(async () => {
    delete (globalThis as Record<symbol, unknown>)[RATE_LIMITER_KEY];
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T00:00:00Z"));
    vi.stubEnv("STAFF_PASSWORD", "mat-khau");
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("TRUSTED_PROXY_HOPS", "");
    vi.stubEnv("COOKIE_SECURE", "");
    cookieValue.value = undefined;
    cookieValue.staff = undefined;
    const { testStore } = (await import("@/features/orders/server")) as unknown as {
      testStore: StoreGateway;
    };
    await testStore.update((data) => ({ data: { ...data, orders: [] }, result: undefined }));
    await seed("SL-20261021-AAAAAA", "0912345678");
    await seed("SL-20261021-BBBBBB", "+84987654321");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("200 - khớp: chỉ trả orderId, cấp sl_own ký đúng, hạn 30 ngày", async () => {
    const before = Date.now();
    const response = await lookup({ orderId: " sl-20261021-aaaaaa ", phone: "+84 912 345 678" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orderId: "SL-20261021-AAAAAA" });

    const cookie = setCookie(response);
    expect(cookie).toMatch(/^sl_own=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Secure/i);

    const verified = verifyToken(tokenOf(response), SECRET, "own", Date.now());
    expect(verified.ok).toBe(true);
    if (verified.ok && verified.payload.purpose === "own") {
      expect(verified.payload.orderIds).toEqual(["SL-20261021-AAAAAA"]);
      expect(verified.payload.exp).toBeGreaterThanOrEqual(before + 2_592_000_000);
      expect(verified.payload.exp).toBeLessThanOrEqual(Date.now() + 2_592_000_000);
    }
  });

  it("200 - thân chỉ { orderId }, không internalNotes dù đơn có ghi chú", async () => {
    const NOTE = "GHI-CHU-NOI-BO-LOOKUP";
    const { testStore } = (await import("@/features/orders/server")) as unknown as {
      testStore: StoreGateway;
    };
    await testStore.update((data) => ({
      data: updateOrder(data, "SL-20261021-AAAAAA", (o) => ({
        ...o,
        internalNotes: [{ id: "n1", text: NOTE, createdAt: o.createdAt }],
      })).data,
      result: undefined,
    }));
    const response = await lookup({ orderId: "SL-20261021-AAAAAA", phone: "0912345678" });
    expect(response.status).toBe(200);
    const text = await response.text();
    const body = JSON.parse(text);
    expect(body).not.toHaveProperty("internalNotes");
    expect(Object.keys(body)).toEqual(["orderId"]);
    expect(text).not.toContain(NOTE);
  });

  it("200 - người gọi có sl_staff hợp lệ: thân vẫn đúng [orderId], không ghi chú", async () => {
    const NOTE = "GHI-CHU-NOI-BO-STAFF";
    const { testStore } = (await import("@/features/orders/server")) as unknown as {
      testStore: StoreGateway;
    };
    await testStore.update((data) => ({
      data: updateOrder(data, "SL-20261021-AAAAAA", (o) => ({
        ...o,
        internalNotes: [{ id: "n1", text: NOTE, createdAt: o.createdAt }],
      })).data,
      result: undefined,
    }));
    cookieValue.staff = signToken({ purpose: "staff", exp: Date.now() + 60_000 }, SECRET);
    const response = await lookup({ orderId: "SL-20261021-AAAAAA", phone: "0912345678" });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(Object.keys(JSON.parse(text))).toEqual(["orderId"]);
    expect(text).not.toContain(NOTE);
  });

  it("thuộc tính Secure của sl_own theo COOKIE_SECURE và giao thức", async () => {
    const body = { orderId: "SL-20261021-AAAAAA", phone: "0912345678" };
    expect(setCookie(await lookup(body))).not.toMatch(/Secure/i);

    vi.stubEnv("COOKIE_SECURE", "true");
    expect(setCookie(await lookup(body))).toMatch(/Secure/i);
    vi.stubEnv("COOKIE_SECURE", "");

    const https = await POST(
      new Request("https://shop.test/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    expect(setCookie(https)).toMatch(/Secure/i);
  });

  it("SĐT lưu +84, nhập 0 cũng khớp", async () => {
    const response = await lookup({ orderId: "SL-20261021-BBBBBB", phone: "0987654321" });
    expect(response.status).toBe(200);
  });

  it("gộp với sl_own cũ hợp lệ", async () => {
    cookieValue.value = signToken(
      { purpose: "own", exp: Date.now() + 100_000, orderIds: ["SL-OLD"] },
      SECRET,
    );
    const response = await lookup({ orderId: "SL-20261021-AAAAAA", phone: "0912345678" });
    const verified = verifyToken(tokenOf(response), SECRET, "own", Date.now());
    expect(verified.ok && verified.payload.purpose === "own" && verified.payload.orderIds).toEqual([
      "SL-OLD",
      "SL-20261021-AAAAAA",
    ]);
  });

  it("đầy 20 thì bỏ id cũ nhất", async () => {
    const full = Array.from({ length: 20 }, (_, i) => `SL-OLD-${i}`);
    cookieValue.value = signToken(
      { purpose: "own", exp: Date.now() + 100_000, orderIds: full },
      SECRET,
    );
    const response = await lookup({ orderId: "SL-20261021-AAAAAA", phone: "0912345678" });
    const verified = verifyToken(tokenOf(response), SECRET, "own", Date.now());
    const orderIds =
      verified.ok && verified.payload.purpose === "own" ? verified.payload.orderIds : [];
    expect(orderIds).toHaveLength(20);
    expect(orderIds[0]).toBe("SL-OLD-1");
    expect(orderIds[19]).toBe("SL-20261021-AAAAAA");
  });

  it("cookie cũ hỏng hoặc hết hạn thì bắt đầu danh sách mới", async () => {
    for (const old of [
      "rac.rac",
      signToken({ purpose: "own", exp: Date.now() - 1, orderIds: ["SL-OLD"] }, SECRET),
    ]) {
      cookieValue.value = old;
      const response = await lookup({ orderId: "SL-20261021-AAAAAA", phone: "0912345678" });
      const verified = verifyToken(tokenOf(response), SECRET, "own", Date.now());
      expect(
        verified.ok && verified.payload.purpose === "own" && verified.payload.orderIds,
      ).toEqual(["SL-20261021-AAAAAA"]);
    }
  });

  it("404 - mọi kiểu sai cùng thân và thông báo, không Set-Cookie", async () => {
    const bodies: string[] = [];
    for (const input of [
      { orderId: "SL-20261021-000000", phone: "0912345678" },
      { orderId: "SL-20261021-AAAAAA", phone: "0900000000" },
      { orderId: "SL-NOPE", phone: "0900000000" },
      { orderId: "SL-20261021-AAAAAA", phone: "abc" },
    ]) {
      const response = await lookup(input);
      expect(response.status).toBe(404);
      expect(setCookie(response)).toBe("");
      const text = await response.text();
      expect(JSON.parse(text).error).toEqual({ code: "ORDER_NOT_FOUND", message: NOT_FOUND });
      bodies.push(text);
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it.each([
    ["thiếu orderId", { phone: "0912345678" }],
    ["thiếu phone", { orderId: "SL-1" }],
    ["orderId rỗng", { orderId: "  ", phone: "0912345678" }],
    ["phone là số", { orderId: "SL-1", phone: 912345678 }],
    ["orderId null", { orderId: null, phone: "0912345678" }],
    ["JSON hỏng", "{oops"],
  ])("400 - %s", async (_name, body) => {
    const response = await lookup(body);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(setCookie(response)).toBe("");
  });

  it("400 - sai Content-Type hoặc Origin lệch, không cookie", async () => {
    const wrongType = await POST(
      new Request("http://shop.test/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ orderId: "SL-20261021-AAAAAA", phone: "0912345678" }),
      }),
    );
    expect(wrongType.status).toBe(400);
    expect(setCookie(wrongType)).toBe("");

    const badOrigin = await lookup(
      { orderId: "SL-20261021-AAAAAA", phone: "0912345678" },
      { Host: "shop.test", Origin: "http://evil.test" },
    );
    expect(badOrigin.status).toBe(400);
    expect((await badOrigin.json()).error.code).toBe("VALIDATION_ERROR");
    expect(setCookie(badOrigin)).toBe("");
  });

  it("404 giống sai khi chưa cấu hình, không cookie, log cảnh báo không PII", async () => {
    vi.stubEnv("SESSION_SECRET", "ngan");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await lookup({ orderId: "SL-20261021-AAAAAA", phone: "0912345678" });
    expect(response.status).toBe(404);
    expect((await response.json()).error).toEqual({ code: "ORDER_NOT_FOUND", message: NOT_FOUND });
    expect(setCookie(response)).toBe("");
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("lookup_unconfigured");
    expect(logged).not.toContain("SL-20261021-AAAAAA");
    expect(logged).not.toContain("0912345678");
    log.mockRestore();
  });

  it("404 chung khi thiếu STAFF_PASSWORD, không Set-Cookie", async () => {
    vi.stubEnv("STAFF_PASSWORD", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await lookup({ orderId: "SL-20261021-AAAAAA", phone: "0912345678" });
    expect(response.status).toBe(404);
    expect((await response.json()).error).toEqual({ code: "ORDER_NOT_FOUND", message: NOT_FOUND });
    expect(setCookie(response)).toBe("");
    log.mockRestore();
  });

  it("không log Mã đơn hay SĐT ở mọi nhánh", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await lookup({ orderId: "SL-20261021-AAAAAA", phone: "0912345678" });
    await lookup({ orderId: "SL-20261021-AAAAAA", phone: "0900000000" });
    const logged = JSON.stringify([...log.mock.calls, ...err.mock.calls]);
    expect(logged).not.toContain("SL-20261021-AAAAAA");
    expect(logged).not.toContain("0912345678");
    log.mockRestore();
    err.mockRestore();
  });

  describe("giới hạn thử sai", () => {
    const AAA = "SL-20261021-AAAAAA";
    const good = { orderId: AAA, phone: "0912345678" };
    const fromIp = (ip: string) => ({ "X-Forwarded-For": ip });

    async function failFrom(ip: string, times: number, orderId = AAA) {
      for (let i = 0; i < times; i++) {
        const response = await lookup({ orderId, phone: "0900000000" }, fromIp(ip));
        expect(response.status).toBe(404);
      }
    }

    it("4 lần sai: lần 5 vẫn 404", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      await failFrom("1.1.1.1", 4);
      expect((await lookup({ orderId: AAA, phone: "0900000000" }, fromIp("1.1.1.1"))).status).toBe(
        404,
      );
    });

    it("5 sai cùng IP: lần 6 (kể cả đúng) 429, không sl_own, thân đúng, log bucket lookup", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      await failFrom("1.1.1.1", 5, "SL-NOPE");
      for (const input of [good, { orderId: "SL-NOPE", phone: "0900000000" }]) {
        const response = await lookup(input, fromIp("1.1.1.1"));
        expect(response.status).toBe(429);
        expect(await response.json()).toEqual({
          error: { code: "RATE_LIMITED", message: RATE_LIMITED },
        });
        expect(setCookie(response)).toBe("");
      }
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines).toEqual(
        Array(2).fill(
          JSON.stringify({ event: "rate_limited", code: "RATE_LIMITED", bucket: "lookup" }),
        ),
      );
      const logged = lines.join("");
      for (const secret of ["1.1.1.1", "SL-NOPE", AAA, "0912345678", "0900000000"]) {
        expect(logged).not.toContain(secret);
      }
      log.mockRestore();
      expect((await lookup(good, fromIp("2.2.2.2"))).status).toBe(200);
    });

    it("20 sai/giờ vào cùng Mã đơn từ IP khác nhau: IP mới + SĐT đúng vẫn 429 cùng lời", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      for (let i = 0; i < 20; i++) {
        // đổi hoa/thường và khoảng trắng không né được bucket
        const orderId = i % 2 === 0 ? ` ${AAA.toLowerCase()} ` : AAA;
        const response = await lookup({ orderId, phone: "0900000000" }, fromIp(`10.0.${i}.1`));
        expect(response.status).toBe(404);
      }
      const response = await lookup(good, fromIp("200.200.200.200"));
      expect(response.status).toBe(429);
      expect((await response.json()).error.message).toBe(RATE_LIMITED);
      expect(setCookie(response)).toBe("");
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines).toEqual([
        JSON.stringify({ event: "rate_limited", code: "RATE_LIMITED", bucket: "lookup-order" }),
      ]);
      log.mockRestore();

      vi.advanceTimersByTime(60 * 60_000 + 1);
      expect((await lookup(good, fromIp("200.200.200.200"))).status).toBe(200);
    });

    it("yêu cầu song song sai cùng IP/Mã đơn: đúng 5 lần 404, còn lại 429", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      const responses = await Promise.all(
        Array.from({ length: 12 }, () =>
          lookup({ orderId: AAA, phone: "0900000000" }, fromIp("1.1.1.1")),
        ),
      );
      const statuses = responses.map((r) => r.status);
      expect(statuses.filter((s) => s === 404)).toHaveLength(5);
      expect(statuses.filter((s) => s === 429)).toHaveLength(7);
      expect((await lookup(good, fromIp("1.1.1.1"))).status).toBe(429);
    });

    it("hết cửa sổ 15 phút thì thử lại được", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      await failFrom("1.1.1.1", 5);
      expect((await lookup(good, fromIp("1.1.1.1"))).status).toBe(429);
      vi.advanceTimersByTime(15 * 60_000 + 1);
      expect((await lookup(good, fromIp("1.1.1.1"))).status).toBe(200);
    });

    it("tra cứu đúng không ghi sai và không reset bộ đếm", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      await failFrom("1.1.1.1", 4);
      expect((await lookup(good, fromIp("1.1.1.1"))).status).toBe(200);
      expect((await lookup(good, fromIp("1.1.1.1"))).status).toBe(200);
      expect((await lookup({ orderId: AAA, phone: "0900000000" }, fromIp("1.1.1.1"))).status).toBe(
        404,
      );
      expect((await lookup(good, fromIp("1.1.1.1"))).status).toBe(429);
    });

    it("SĐT sai định dạng cũng tính là sai", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      for (let i = 0; i < 5; i++) {
        expect((await lookup({ orderId: AAA, phone: "abc" }, fromIp("1.1.1.1"))).status).toBe(404);
      }
      expect((await lookup(good, fromIp("1.1.1.1"))).status).toBe(429);
    });

    it("TRUSTED_PROXY_HOPS=0: mọi người dùng chung khóa direct", async () => {
      await failFrom("1.1.1.1", 5);
      expect((await lookup(good, fromIp("9.9.9.9"))).status).toBe(429);
    });

    it("giả mạo phần tử đầu x-forwarded-for không né được khóa", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      await failFrom("5.5.5.5", 5);
      expect((await lookup(good, fromIp("6.6.6.6, 5.5.5.5"))).status).toBe(429);
    });

    it("không tính: 400 (body, CSRF) và chưa cấu hình", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      for (let i = 0; i < 6; i++) {
        expect((await lookup({ orderId: AAA }, fromIp("1.1.1.1"))).status).toBe(400);
        expect((await lookup({ orderId: AAA, phone: 5 }, fromIp("1.1.1.1"))).status).toBe(400);
        expect(
          (
            await lookup(good, {
              ...fromIp("1.1.1.1"),
              Host: "shop.test",
              Origin: "http://evil.test",
            })
          ).status,
        ).toBe(400);
      }
      vi.stubEnv("SESSION_SECRET", "ngan");
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      for (let i = 0; i < 6; i++) {
        expect((await lookup(good, fromIp("1.1.1.1"))).status).toBe(404);
      }
      log.mockRestore();
      vi.stubEnv("SESSION_SECRET", SECRET);
      expect((await lookup(good, fromIp("1.1.1.1"))).status).toBe(200);
    });
  });
});
