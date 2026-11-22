// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRateLimiter, MAX_TRACKED_KEYS } from "./rate-limiter";

const MIN = 60_000;
const HOUR = 60 * MIN;

const CAP = 50;

function setup(maxKeys?: number) {
  let t = 1_000_000;
  const limiter = createRateLimiter({ now: () => t, maxKeys });
  return {
    limiter,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("rate limiter", () => {
  it("4 lần sai vẫn cho qua, 5 lần thì khóa kèm thời gian còn lại", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 4; i++) limiter.recordFailure("login", "1.1.1.1");
    expect(limiter.check("login", "1.1.1.1")).toEqual({ blocked: false });
    advance(5 * MIN);
    limiter.recordFailure("login", "1.1.1.1");
    expect(limiter.check("login", "1.1.1.1")).toEqual({ blocked: true, retryAfterMs: 10 * MIN });
  });

  it("hết cửa sổ thì cho qua và lần sai kế mở cửa sổ mới", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure("login", "a");
    advance(15 * MIN);
    expect(limiter.check("login", "a")).toEqual({ blocked: false });
    limiter.recordFailure("login", "a");
    expect(limiter.check("login", "a")).toEqual({ blocked: false });
  });

  it("check không ghi nhận gì (lần đúng không đổi bộ đếm)", () => {
    const { limiter } = setup();
    for (let i = 0; i < 4; i++) limiter.recordFailure("login", "a");
    for (let i = 0; i < 10; i++) limiter.check("login", "a");
    expect(limiter.check("login", "a")).toEqual({ blocked: false });
    limiter.recordFailure("login", "a");
    expect(limiter.check("login", "a").blocked).toBe(true);
  });

  it("recordFailure khi đang khóa không kéo dài cửa sổ", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure("login", "a");
    advance(10 * MIN);
    for (let i = 0; i < 5; i++) limiter.recordFailure("login", "a");
    expect(limiter.check("login", "a")).toEqual({ blocked: true, retryAfterMs: 5 * MIN });
    advance(5 * MIN);
    expect(limiter.check("login", "a")).toEqual({ blocked: false });
  });

  it("lookup: 5 sai / 15 phút", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 4; i++) limiter.recordFailure("lookup", "a");
    expect(limiter.check("lookup", "a")).toEqual({ blocked: false });
    limiter.recordFailure("lookup", "a");
    expect(limiter.check("lookup", "a")).toEqual({ blocked: true, retryAfterMs: 15 * MIN });
    advance(15 * MIN);
    expect(limiter.check("lookup", "a")).toEqual({ blocked: false });
  });

  it("bucket độc lập", () => {
    const { limiter } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure("login", "a");
    expect(limiter.check("login", "a").blocked).toBe(true);
    expect(limiter.check("lookup", "a").blocked).toBe(false);
    expect(limiter.check("login", "b").blocked).toBe(false);
  });

  it("lookup-order 20 sai/giờ, login-all 30 sai/giờ", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 19; i++) limiter.recordFailure("lookup-order", "o1");
    expect(limiter.check("lookup-order", "o1").blocked).toBe(false);
    limiter.recordFailure("lookup-order", "o1");
    expect(limiter.check("lookup-order", "o1")).toEqual({ blocked: true, retryAfterMs: HOUR });
    for (let i = 0; i < 29; i++) limiter.recordFailure("login-all", "all");
    expect(limiter.check("login-all", "all").blocked).toBe(false);
    limiter.recordFailure("login-all", "all");
    expect(limiter.check("login-all", "all").blocked).toBe(true);
    advance(HOUR);
    expect(limiter.check("lookup-order", "o1").blocked).toBe(false);
    expect(limiter.check("login-all", "all").blocked).toBe(false);
  });

  it("trần mặc định là 10.000 khóa", () => {
    expect(MAX_TRACKED_KEYS).toBe(10_000);
  });

  it("vượt trần: bỏ khóa chưa bị khóa cũ nhất, giữ khóa đang bị khóa", () => {
    const { limiter } = setup(CAP);
    limiter.recordFailure("lookup-order", "unblocked-old");
    for (let i = 0; i < 5; i++) limiter.recordFailure("login", "locked");
    for (let i = 0; i < CAP; i++) limiter.recordFailure("lookup-order", `fake-${i}`);
    expect(limiter.check("login", "locked").blocked).toBe(true);
    // bộ đếm của unblocked-old đã bị bỏ nên 19 lần sai nữa chưa đủ 20
    for (let i = 0; i < 19; i++) limiter.recordFailure("lookup-order", "unblocked-old");
    expect(limiter.check("lookup-order", "unblocked-old").blocked).toBe(false);
  });

  it("vượt trần khi tất cả đang bị khóa thì bỏ khóa cũ nhất", () => {
    const { limiter } = setup(CAP);
    for (let i = 0; i < CAP + 1; i++) {
      for (let j = 0; j < 5; j++) limiter.recordFailure("login", `ip-${i}`);
    }
    expect(limiter.check("login", "ip-0").blocked).toBe(false);
    expect(limiter.check("login", "ip-1").blocked).toBe(true);
    expect(limiter.check("login", `ip-${CAP}`).blocked).toBe(true);
  });
});
