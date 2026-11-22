// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

function run(path: string, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = cookie;
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
}

function location(res: Response): string | null {
  const value = res.headers.get("location");
  if (value === null) return null;
  const url = new URL(value);
  return url.pathname + url.search;
}

describe("proxy", () => {
  it("không cookie: chuyển hướng tới /staff/login trơn", () => {
    for (const path of ["/staff", "/staff/orders/x"]) {
      const res = run(path);
      expect(res.status).toBe(307);
      expect(location(res)).toBe("/staff/login");
    }
  });

  it("bỏ query, không thêm ?next=", () => {
    const res = run("/staff/orders/x?a=1&next=/staff");
    expect(location(res)).toBe("/staff/login");
  });

  it("cookie rỗng như không có cookie", () => {
    const res = run("/staff", "sl_staff=");
    expect(res.status).toBe(307);
    expect(location(res)).toBe("/staff/login");
  });

  it("/staff/login không cookie thì cho qua", () => {
    const res = run("/staff/login");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("/staff/login/x không được miễn", () => {
    const res = run("/staff/login/x");
    expect(res.status).toBe(307);
    expect(location(res)).toBe("/staff/login");
  });

  it("cookie bất kỳ khác rỗng thì cho qua", () => {
    const res = run("/staff/orders/x", "sl_staff=garbage");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("matcher đúng chuỗi, không phủ /api/staff", () => {
    expect(config.matcher).toBe("/staff/:path*");
  });
});
