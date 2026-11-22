// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "@/features/access/signed-token";
import { POST } from "./route";

const cookieValue = vi.hoisted(() => ({
  value: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "sl_staff" && cookieValue.value !== undefined
        ? { name, value: cookieValue.value }
        : undefined,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const SECRET = "s".repeat(32);
const NOW = Date.parse("2026-11-21T00:00:00Z");

function logout(
  headers: Record<string, string> = { "Content-Type": "application/json" },
  url = "http://shop.test/api/staff/logout",
): Promise<Response> {
  return POST(
    new Request(url, {
      method: "POST",
      headers,
      body: "{}",
    }),
  );
}

const JSON_CT = { "Content-Type": "application/json" };

describe("POST /api/staff/logout", () => {
  beforeEach(() => {
    cookieValue.value = undefined;
    vi.stubEnv("STAFF_PASSWORD", "pw");
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("TRUSTED_PROXY_HOPS", "");
    vi.stubEnv("COOKIE_SECURE", "");
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("200 - có phiên hợp lệ thì xóa cookie sl_staff", async () => {
    cookieValue.value = signToken(
      { purpose: "staff", exp: NOW + 1000 },
      SECRET,
    );
    const response = await logout();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^sl_staff=;/);
    expect(cookie).toMatch(/Max-Age=0/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
  });

  it("cookie xóa có Secure theo giao thức / COOKIE_SECURE", async () => {
    cookieValue.value = signToken(
      { purpose: "staff", exp: NOW + 1000 },
      SECRET,
    );
    const https = await logout(JSON_CT, "https://shop.test/api/staff/logout");
    expect(https.headers.get("set-cookie") ?? "").toMatch(/Secure/i);

    vi.stubEnv("COOKIE_SECURE", "true");
    const forced = await logout();
    expect(forced.headers.get("set-cookie") ?? "").toMatch(/Secure/i);

    vi.stubEnv("COOKIE_SECURE", "");
    const plain = await logout();
    expect(plain.headers.get("set-cookie") ?? "").not.toMatch(/Secure/i);
  });

  it.each([
    ["không cookie", () => undefined],
    [
      "cookie hết hạn",
      () => signToken({ purpose: "staff", exp: NOW - 1 }, SECRET),
    ],
    [
      "sai chữ ký",
      () => signToken({ purpose: "staff", exp: NOW + 1000 }, "x".repeat(32)),
    ],
  ])("401 - %s", async (_name, make) => {
    cookieValue.value = make();
    const response = await logout();
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe(
      "Bạn cần đăng nhập để thực hiện thao tác này",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("400 - sai Content-Type, không đụng cookie", async () => {
    cookieValue.value = signToken(
      { purpose: "staff", exp: NOW + 1000 },
      SECRET,
    );
    const response = await logout({ "Content-Type": "text/plain" });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("400 - Origin lệch Host, không đụng cookie", async () => {
    cookieValue.value = signToken(
      { purpose: "staff", exp: NOW + 1000 },
      SECRET,
    );
    const response = await logout({
      ...JSON_CT,
      Host: "shop.test",
      Origin: "http://evil.test",
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("X-Forwarded-Host: hops 0 thì 400, hops > 0 thì 200", async () => {
    cookieValue.value = signToken(
      { purpose: "staff", exp: NOW + 1000 },
      SECRET,
    );
    const headers = {
      ...JSON_CT,
      Host: "internal:3000",
      "X-Forwarded-Host": "shop.test",
      Origin: "https://shop.test",
    };
    expect((await logout(headers)).status).toBe(400);
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    expect((await logout(headers)).status).toBe(200);
  });

  it("401 - chưa cấu hình dù có cookie", async () => {
    cookieValue.value = signToken(
      { purpose: "staff", exp: NOW + 1000 },
      SECRET,
    );
    vi.stubEnv("SESSION_SECRET", "");
    const response = await logout();
    expect(response.status).toBe(401);
  });
});
