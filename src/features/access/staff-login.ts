import { createHash, timingSafeEqual } from "node:crypto";

/** Phiên nhân viên kéo dài đúng 12 giờ (mili giây). */
export const STAFF_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** `Secure` = COOKIE_SECURE nếu có, nếu không theo giao thức (X-Forwarded-Proto chỉ khi hops > 0). */
export function resolveCookieSecure(
  request: Request,
  config: { cookieSecure: boolean | undefined; trustedProxyHops: number },
): boolean {
  if (config.cookieSecure !== undefined) return config.cookieSecure;
  const forwarded =
    config.trustedProxyHops > 0
      ? request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
      : undefined;
  const protocol = forwarded
    ? `${forwarded.toLowerCase()}:`
    : new URL(request.url).protocol;
  return protocol === "https:";
}

/** So mật khẩu bằng SHA-256 cả hai (cùng độ dài) rồi timingSafeEqual. */
export function isStaffPasswordValid(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
