// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyToken } from "@/features/access/signed-token";
import { POST } from "./route";

const SECRET = "s".repeat(32);
const PASSWORD = "mat-khau-nhan-vien";
const RATE_LIMITED = "Bạn đã thử sai quá nhiều lần. Vui lòng thử lại sau 15 phút.";
const RATE_LIMITER_KEY = Symbol.for("shoplite.access.rateLimiter");

function login(
  body: unknown,
  headers: Record<string, string> = {},
  url = "http://shop.test/api/staff/login",
): Promise<Response> {
  return POST(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function cookieHeader(response: Response): string {
  return response.headers.get("set-cookie") ?? "";
}

describe("POST /api/staff/login", () => {
  beforeEach(() => {
    delete (globalThis as Record<symbol, unknown>)[RATE_LIMITER_KEY];
    vi.stubEnv("STAFF_PASSWORD", PASSWORD);
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("TRUSTED_PROXY_HOPS", "");
    vi.stubEnv("COOKIE_SECURE", "");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("200 - đúng mật khẩu, đặt sl_staff ký với exp và Max-Age 12 giờ", async () => {
    const now = Date.now();
    const response = await login(
      { password: PASSWORD },
      { Host: "shop.test", Origin: "http://shop.test" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const cookie = cookieHeader(response);
    expect(cookie).toMatch(/^sl_staff=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Max-Age=43200/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Secure/i);

    const token = cookie.split(";")[0].slice("sl_staff=".length);
    const verified = verifyToken(token, SECRET, "staff", now);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.payload.exp).toBe(now + 43_200_000);
    expect(cookie).not.toContain(PASSWORD);
    expect(
      Buffer.from(token.split(".")[0], "base64url").toString(),
    ).not.toContain(PASSWORD);
  });

  it("Secure theo giao thức https của request", async () => {
    const response = await login(
      { password: PASSWORD },
      {},
      "https://shop.test/api/staff/login",
    );
    expect(cookieHeader(response)).toMatch(/Secure/i);
  });

  it("COOKIE_SECURE=true ép Secure trên http", async () => {
    vi.stubEnv("COOKIE_SECURE", "true");
    const response = await login({ password: PASSWORD });
    expect(cookieHeader(response)).toMatch(/Secure/i);
  });

  it("X-Forwarded-Proto chỉ được tin khi hops > 0", async () => {
    const ignored = await login(
      { password: PASSWORD },
      { "X-Forwarded-Proto": "https" },
    );
    expect(cookieHeader(ignored)).not.toMatch(/Secure/i);

    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const trusted = await login(
      { password: PASSWORD },
      { "X-Forwarded-Proto": "https" },
    );
    expect(cookieHeader(trusted)).toMatch(/Secure/i);
  });

  it("401 - mật khẩu sai, không đặt cookie", async () => {
    const response = await login({ password: "sai" });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Mật khẩu không đúng.");
    expect(cookieHeader(response)).toBe("");
  });

  it("401 - mật khẩu chuỗi rỗng khi đã cấu hình", async () => {
    const response = await login({ password: "" });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Mật khẩu không đúng.");
    expect(cookieHeader(response)).toBe("");
  });

  it.each([
    ["thiếu password", {}],
    ["password không phải chuỗi", { password: 123 }],
    ["JSON hỏng", "{oops"],
    ["body là null", "null"],
  ])("400 - %s", async (_name, body) => {
    const response = await login(body);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(cookieHeader(response)).toBe("");
  });

  it.each([
    ["thiếu STAFF_PASSWORD", { STAFF_PASSWORD: "" }],
    ["thiếu SESSION_SECRET", { SESSION_SECRET: "" }],
    ["secret quá ngắn", { SESSION_SECRET: "ngan" }],
  ])("401 - chưa cấu hình (%s), kể cả mật khẩu bất kỳ", async (_n, env) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    for (const password of [PASSWORD, "", "bat-ky"]) {
      const response = await login({ password });
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Khu vực nhân viên chưa được cấu hình.");
      expect(cookieHeader(response)).toBe("");
    }
  });

  it("400 - sai Content-Type, không đặt cookie", async () => {
    const response = await POST(
      new Request("http://shop.test/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ password: PASSWORD }),
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(cookieHeader(response)).toBe("");
  });

  it("400 - Origin lệch Host (kể cả null), không đặt cookie", async () => {
    for (const origin of ["http://evil.test", "null"]) {
      const response = await login(
        { password: PASSWORD },
        { Host: "shop.test", Origin: origin },
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
      expect(cookieHeader(response)).toBe("");
    }
  });

  it("X-Forwarded-Host: hops 0 thì 400, hops > 0 thì qua", async () => {
    const headers = {
      Host: "internal:3000",
      "X-Forwarded-Host": "shop.test",
      Origin: "https://shop.test",
    };
    const rejected = await login({ password: PASSWORD }, headers);
    expect(rejected.status).toBe(400);

    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const accepted = await login({ password: PASSWORD }, headers);
    expect(accepted.status).toBe(200);
  });

  it("không log mật khẩu khi thất bại", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await login({ password: "mat-khau-thu-sai" });
    const logged = JSON.stringify([...spy.mock.calls, ...log.mock.calls]);
    expect(logged).not.toContain("mat-khau-thu-sai");
    expect(logged).not.toContain(PASSWORD);
    spy.mockRestore();
    log.mockRestore();
  });

  describe("giới hạn thử sai", () => {
    const fromIp = (ip: string) => ({ "X-Forwarded-For": ip });

    async function failFrom(ip: string, times: number) {
      for (let i = 0; i < times; i++) {
        const response = await login({ password: "sai" }, fromIp(ip));
        expect(response.status).toBe(401);
      }
    }

    it("4 lần sai: lần 5 vẫn 401 'Mật khẩu không đúng.'", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      await failFrom("1.1.1.1", 4);
      const response = await login({ password: "sai" }, fromIp("1.1.1.1"));
      expect(response.status).toBe(401);
      expect((await response.json()).error.message).toBe("Mật khẩu không đúng.");
    });

    it("5 sai cùng IP: lần 6 (kể cả đúng) 429, không cookie, thân đúng, lần nữa vẫn 429", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      await failFrom("1.1.1.1", 5);
      for (const password of [PASSWORD, "sai"]) {
        const response = await login({ password }, fromIp("1.1.1.1"));
        expect(response.status).toBe(429);
        expect(await response.json()).toEqual({
          error: { code: "RATE_LIMITED", message: RATE_LIMITED },
        });
        expect(cookieHeader(response)).toBe("");
      }
      const other = await login({ password: PASSWORD }, fromIp("2.2.2.2"));
      expect(other.status).toBe(200);
    });

    it("hết cửa sổ 15 phút thì thử lại được", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      await failFrom("1.1.1.1", 5);
      expect((await login({ password: PASSWORD }, fromIp("1.1.1.1"))).status).toBe(429);
      vi.advanceTimersByTime(15 * 60_000 + 1);
      expect((await login({ password: PASSWORD }, fromIp("1.1.1.1"))).status).toBe(200);
    });

    it("30 sai/giờ từ nhiều IP: IP mới với mật khẩu đúng cũng 429, log bucket login-all", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      for (let i = 0; i < 30; i++) {
        const response = await login({ password: "sai" }, fromIp(`10.0.${i}.1`));
        expect(response.status).toBe(401);
      }
      const response = await login({ password: PASSWORD }, fromIp("200.200.200.200"));
      expect(response.status).toBe(429);
      expect((await response.json()).error.message).toBe(RATE_LIMITED);
      expect(cookieHeader(response)).toBe("");
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines).toContain(
        JSON.stringify({ event: "rate_limited", code: "RATE_LIMITED", bucket: "login-all" }),
      );
      const logged = lines.join("\n");
      expect(logged).not.toContain("200.200.200.200");
      expect(logged).not.toContain(PASSWORD);
      log.mockRestore();
    });

    it("log khi khóa IP: bucket login, không chứa IP hay mật khẩu", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      await failFrom("3.3.3.3", 5);
      await login({ password: PASSWORD }, fromIp("3.3.3.3"));
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines).toEqual([
        JSON.stringify({ event: "rate_limited", code: "RATE_LIMITED", bucket: "login" }),
      ]);
      expect(lines.join("")).not.toContain("3.3.3.3");
      log.mockRestore();
    });

    it("đăng nhập đúng không ghi sai và không reset bộ đếm", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      await failFrom("1.1.1.1", 4);
      expect((await login({ password: PASSWORD }, fromIp("1.1.1.1"))).status).toBe(200);
      expect((await login({ password: PASSWORD }, fromIp("1.1.1.1"))).status).toBe(200);
      expect((await login({ password: "sai" }, fromIp("1.1.1.1"))).status).toBe(401);
      expect((await login({ password: PASSWORD }, fromIp("1.1.1.1"))).status).toBe(429);
    });

    it("TRUSTED_PROXY_HOPS=0: mọi người dùng chung khóa direct", async () => {
      await failFrom("1.1.1.1", 5);
      const response = await login({ password: PASSWORD }, fromIp("9.9.9.9"));
      expect(response.status).toBe(429);
    });

    it("giả mạo phần tử đầu x-forwarded-for không né được khóa", async () => {
      vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
      await failFrom("5.5.5.5", 5);
      const response = await login({ password: PASSWORD }, fromIp("6.6.6.6, 5.5.5.5"));
      expect(response.status).toBe(429);
    });

    it("không tính: 400 (body/CSRF) và chưa cấu hình", async () => {
      for (let i = 0; i < 6; i++) {
        expect((await login({})).status).toBe(400);
        expect((await login("{oops")).status).toBe(400);
        expect(
          (await login({ password: PASSWORD }, { Host: "shop.test", Origin: "http://evil.test" }))
            .status,
        ).toBe(400);
      }
      expect((await login({ password: PASSWORD })).status).toBe(200);

      vi.stubEnv("STAFF_PASSWORD", "");
      for (let i = 0; i < 6; i++) {
        const response = await login({ password: "x" });
        expect(response.status).toBe(401);
        expect((await response.json()).error.message).toBe("Khu vực nhân viên chưa được cấu hình.");
      }
      vi.stubEnv("STAFF_PASSWORD", PASSWORD);
      expect((await login({ password: PASSWORD })).status).toBe(200);
    });
  });
});
