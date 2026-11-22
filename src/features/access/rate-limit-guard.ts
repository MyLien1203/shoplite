import { OrderError } from "@/features/orders/order-errors";
import { logEvent } from "@/lib/log";
import type { RateLimitBucket, RateLimiter } from "./rate-limiter";

export const RATE_LIMITED_MESSAGE = "Bạn đã thử sai quá nhiều lần. Vui lòng thử lại sau 15 phút.";

export type RateLimitTarget = { bucket: RateLimitBucket; key: string };

/**
 * Kiểm mọi bucket; bucket bị khóa đầu tiên thì ghi log (chỉ tên loại bucket, không khóa) và ném 429.
 * Một lời duy nhất cho mọi bucket.
 */
export function assertNotRateLimited(limiter: RateLimiter, targets: RateLimitTarget[]): void {
  for (const { bucket, key } of targets) {
    if (limiter.check(bucket, key).blocked) {
      logEvent("rate_limited", { bucket, code: "RATE_LIMITED" });
      throw new OrderError("RATE_LIMITED", RATE_LIMITED_MESSAGE);
    }
  }
}

/** Ghi một lần sai vào mọi bucket. */
export function recordFailures(limiter: RateLimiter, targets: RateLimitTarget[]): void {
  for (const { bucket, key } of targets) {
    limiter.recordFailure(bucket, key);
  }
}
