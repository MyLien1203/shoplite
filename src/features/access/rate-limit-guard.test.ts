// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { OrderError } from "@/features/orders/order-errors";
import { assertNotRateLimited, RATE_LIMITED_MESSAGE, recordFailures } from "./rate-limit-guard";
import { createRateLimiter } from "./rate-limiter";

function setup() {
  return createRateLimiter({ now: Date.now });
}

describe("rate-limit-guard", () => {
  let log: MockInstance<typeof console.log>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T00:00:00Z"));
    log = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    log.mockRestore();
    vi.useRealTimers();
  });

  it("không ném khi chưa bị khóa", () => {
    const limiter = setup();
    recordFailures(limiter, [{ bucket: "login", key: "1.1.1.1" }]);
    expect(() =>
      assertNotRateLimited(limiter, [{ bucket: "login", key: "1.1.1.1" }]),
    ).not.toThrow();
    expect(log).not.toHaveBeenCalled();
  });

  it("ghi lần sai vào mọi bucket và ném RATE_LIMITED 429 với lời chung", () => {
    const limiter = setup();
    const targets = [
      { bucket: "login", key: "9.9.9.9" },
      { bucket: "login-all", key: "all" },
    ] as const;
    for (let i = 0; i < 5; i++) recordFailures(limiter, [...targets]);
    let caught: unknown;
    try {
      assertNotRateLimited(limiter, [...targets]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OrderError);
    const err = caught as OrderError;
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.httpStatus).toBe(429);
    expect(err.message).toBe(RATE_LIMITED_MESSAGE);
    expect(limiter.check("login-all", "all").blocked).toBe(false);
  });

  it("log chỉ có event, bucket, code - không có khóa", () => {
    const limiter = setup();
    for (let i = 0; i < 5; i++) recordFailures(limiter, [{ bucket: "lookup", key: "8.8.8.8" }]);
    expect(() => assertNotRateLimited(limiter, [{ bucket: "lookup", key: "8.8.8.8" }])).toThrow();
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(JSON.parse(line)).toEqual({
      event: "rate_limited",
      bucket: "lookup",
      code: "RATE_LIMITED",
    });
    expect(line).not.toContain("8.8.8.8");
  });

  it("lookup-order và login-all cũng dùng đúng một lời (tới 1 giờ)", () => {
    const limiter = setup();
    for (let i = 0; i < 20; i++) recordFailures(limiter, [{ bucket: "lookup-order", key: "SL-1" }]);
    for (let i = 0; i < 30; i++) recordFailures(limiter, [{ bucket: "login-all", key: "all" }]);
    for (const target of [
      { bucket: "lookup-order", key: "SL-1" },
      { bucket: "login-all", key: "all" },
    ] as const) {
      expect(() => assertNotRateLimited(limiter, [target])).toThrow(RATE_LIMITED_MESSAGE);
    }
    const buckets = log.mock.calls.map((c) => JSON.parse(String(c[0])).bucket);
    expect(buckets).toEqual(["lookup-order", "login-all"]);
  });

  it("bucket bị khóa đầu tiên quyết định log", () => {
    const limiter = setup();
    for (let i = 0; i < 5; i++) recordFailures(limiter, [{ bucket: "lookup", key: "a" }]);
    for (let i = 0; i < 20; i++) recordFailures(limiter, [{ bucket: "lookup-order", key: "X" }]);
    expect(() =>
      assertNotRateLimited(limiter, [
        { bucket: "lookup", key: "a" },
        { bucket: "lookup-order", key: "X" },
      ]),
    ).toThrow();
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0][0])).bucket).toBe("lookup");
  });
});
