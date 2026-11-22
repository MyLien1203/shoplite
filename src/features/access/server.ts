import { type AccessConfig, readAccessConfig } from "./access-config";
import { createRateLimiter, type RateLimiter } from "./rate-limiter";

/**
 * Composition root của access. Chỉ import từ code chạy trên server.
 * Đọc process.env khi được gọi (không phải lúc import) để thiếu cấu hình không làm vỡ import.
 */
export function getAccessConfig(): AccessConfig {
  return readAccessConfig(process.env);
}

const RATE_LIMITER_KEY = Symbol.for("shoplite.access.rateLimiter");
type GlobalWithLimiter = typeof globalThis & { [RATE_LIMITER_KEY]?: RateLimiter };

/** Instance bộ đếm dùng chung toàn tiến trình, tạo lười. */
export function getRateLimiter(): RateLimiter {
  const g = globalThis as GlobalWithLimiter;
  g[RATE_LIMITER_KEY] ??= createRateLimiter({ now: Date.now });
  return g[RATE_LIMITER_KEY];
}
