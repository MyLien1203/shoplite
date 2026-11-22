import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { NO_LEAK_HEADERS, NO_LEAK_SOURCES, securityHeaders } from "./security-headers";

describe("security headers", () => {
  it("áp Referrer-Policy và Cache-Control cho bốn nhóm đường dẫn", async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toBeDefined();
    expect(rules).toHaveLength(4);
    expect(rules?.map((r) => r.source)).toEqual([...NO_LEAK_SOURCES]);
    expect(NO_LEAK_SOURCES).toEqual([
      "/orders/:path*",
      "/staff/:path*",
      "/api/orders/:path*",
      "/api/staff/:path*",
    ]);
    for (const rule of rules ?? []) {
      expect(rule.headers).toEqual(
        expect.arrayContaining([
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ]),
      );
    }
  });

  it("không phủ trang công khai", () => {
    const sources = securityHeaders().map((r) => r.source);
    expect(sources).not.toContain("/");
    expect(sources).not.toContain("/products/:path*");
    expect(NO_LEAK_HEADERS).toHaveLength(2);
  });
});
