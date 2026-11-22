export type RateLimitBucket = "login" | "lookup" | "lookup-order" | "login-all";

export type RateLimitCheck = { blocked: false } | { blocked: true; retryAfterMs: number };

export type RateLimiter = {
  check(bucket: RateLimitBucket, key: string): RateLimitCheck;
  recordFailure(bucket: RateLimitBucket, key: string): void;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const MAX_TRACKED_KEYS = 10_000;

const RULES: Record<RateLimitBucket, { limit: number; windowMs: number }> = {
  login: { limit: 5, windowMs: 15 * MINUTE_MS },
  lookup: { limit: 5, windowMs: 15 * MINUTE_MS },
  "lookup-order": { limit: 20, windowMs: HOUR_MS },
  "login-all": { limit: 30, windowMs: HOUR_MS },
};

type Entry = { count: number; windowStart: number; limit: number; windowMs: number };

export function createRateLimiter({
  now,
  maxKeys = MAX_TRACKED_KEYS,
}: {
  now: () => number;
  maxKeys?: number;
}): RateLimiter {
  const entries = new Map<string, Entry>();

  const isExpired = (e: Entry, t: number) => t - e.windowStart >= e.windowMs;
  const isBlocked = (e: Entry, t: number) => e.count >= e.limit && !isExpired(e, t);

  function sweep(t: number): void {
    for (const [k, e] of entries) {
      if (isExpired(e, t)) entries.delete(k);
    }
  }

  function enforceCap(t: number, keep: string): void {
    while (entries.size > maxKeys) {
      let victim: string | undefined;
      for (const [k, e] of entries) {
        if (k !== keep && !isBlocked(e, t)) {
          victim = k;
          break;
        }
      }
      if (victim === undefined) {
        for (const k of entries.keys()) {
          if (k !== keep) {
            victim = k;
            break;
          }
        }
      }
      if (victim === undefined) return;
      entries.delete(victim);
    }
  }

  return {
    check(bucket, key) {
      const t = now();
      sweep(t);
      const e = entries.get(`${bucket}:${key}`);
      if (e && isBlocked(e, t)) {
        return { blocked: true, retryAfterMs: e.windowStart + e.windowMs - t };
      }
      return { blocked: false };
    },
    recordFailure(bucket, key) {
      const t = now();
      sweep(t);
      const id = `${bucket}:${key}`;
      const e = entries.get(id);
      if (e) {
        if (e.count < e.limit) e.count += 1;
        return;
      }
      const { limit, windowMs } = RULES[bucket];
      entries.set(id, { count: 1, windowStart: t, limit, windowMs });
      enforceCap(t, id);
    },
  };
}
