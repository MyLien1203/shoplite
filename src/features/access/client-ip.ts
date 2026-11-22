const MAX_KEY_LENGTH = 64;
const DIRECT = "direct";

/**
 * Khóa địa chỉ máy khách: phần tử thứ N từ phải (đánh số từ 1) của x-forwarded-for.
 * Không tin các phần tử bên trái vì máy khách tự thêm được. Thiếu/lỗi thì "direct".
 */
export function getClientKey(forwardedFor: string | null | undefined, trustedProxyHops: number): string {
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops <= 0) return DIRECT;
  if (!forwardedFor) return DIRECT;
  const parts = forwardedFor.split(",");
  if (parts.length < trustedProxyHops) return DIRECT;
  const picked = parts[parts.length - trustedProxyHops].trim();
  if (picked === "") return DIRECT;
  return picked.slice(0, MAX_KEY_LENGTH);
}
