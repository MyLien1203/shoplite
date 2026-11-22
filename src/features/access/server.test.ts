// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAccessConfig, getRateLimiter } from "./server";

describe("getAccessConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("đủ biến môi trường thì configured: true", () => {
    vi.stubEnv("STAFF_PASSWORD", "pw");
    vi.stubEnv("SESSION_SECRET", "s".repeat(32));
    expect(getAccessConfig().configured).toBe(true);
  });

  it("thiếu biến môi trường thì configured: false, không ném", () => {
    vi.stubEnv("STAFF_PASSWORD", "");
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => getAccessConfig()).not.toThrow();
    expect(getAccessConfig()).toEqual({ configured: false });
  });
});

describe("getRateLimiter", () => {
  it("trả cùng một instance giữa các lần gọi", () => {
    expect(getRateLimiter()).toBe(getRateLimiter());
  });
});
