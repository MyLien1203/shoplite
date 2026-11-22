// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readAccessConfig } from "./access-config";

const SECRET = "s".repeat(32);
const base = { STAFF_PASSWORD: "pw", SESSION_SECRET: SECRET };

describe("readAccessConfig", () => {
  it("thiếu STAFF_PASSWORD thì chưa cấu hình", () => {
    expect(readAccessConfig({ SESSION_SECRET: SECRET })).toEqual({
      configured: false,
    });
  });

  it("thiếu SESSION_SECRET thì chưa cấu hình", () => {
    expect(readAccessConfig({ STAFF_PASSWORD: "pw" })).toEqual({
      configured: false,
    });
  });

  it("secret ngắn hơn 32 ký tự thì chưa cấu hình", () => {
    expect(
      readAccessConfig({
        STAFF_PASSWORD: "pw",
        SESSION_SECRET: "s".repeat(31),
      }),
    ).toEqual({
      configured: false,
    });
  });

  it("đủ cấu hình: hops mặc định 0, cookieSecure không đặt", () => {
    expect(readAccessConfig(base)).toEqual({
      configured: true,
      staffPassword: "pw",
      sessionSecret: SECRET,
      trustedProxyHops: 0,
      cookieSecure: undefined,
    });
  });

  it("TRUSTED_PROXY_HOPS rác thì về 0", () => {
    for (const v of ["-1", "2abc", "1.5"]) {
      expect(
        readAccessConfig({ ...base, TRUSTED_PROXY_HOPS: v }),
      ).toMatchObject({ trustedProxyHops: 0 });
    }
  });

  it("COOKIE_SECURE được trim và không phân biệt hoa thường", () => {
    expect(
      readAccessConfig({ ...base, COOKIE_SECURE: " TRUE " }),
    ).toMatchObject({ cookieSecure: true });
    expect(readAccessConfig({ ...base, COOKIE_SECURE: "yes" })).toMatchObject({
      cookieSecure: undefined,
    });
  });

  it("đọc TRUSTED_PROXY_HOPS và COOKIE_SECURE", () => {
    expect(
      readAccessConfig({
        ...base,
        TRUSTED_PROXY_HOPS: "2",
        COOKIE_SECURE: "true",
      }),
    ).toMatchObject({ trustedProxyHops: 2, cookieSecure: true });
    expect(
      readAccessConfig({
        ...base,
        TRUSTED_PROXY_HOPS: "abc",
        COOKIE_SECURE: "false",
      }),
    ).toMatchObject({ trustedProxyHops: 0, cookieSecure: false });
  });
});
