import { signToken, verifyToken } from "./signed-token";

export const OWN_COOKIE = "sl_own";
/** Bằng chứng sở hữu đơn kéo dài 30 ngày (mili giây). */
export const OWN_PROOF_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_OWNED_ORDERS = 20;

/** Bỏ trùng, đặt `orderId` mới ở cuối, cắt các mục cũ nhất ở đầu để còn tối đa `max`. */
export function mergeOwnedIds(existing: readonly string[], orderId: string, max: number): string[] {
  const merged = [...existing.filter((id) => id !== orderId), orderId];
  return merged.length > max ? merged.slice(merged.length - max) : merged;
}

/** Đọc danh sách Mã đơn từ token `own`; sai/hết hạn/không có thì `[]`. */
export function readOwnedIds(token: string | undefined, secret: string, now: number): string[] {
  if (!token) return [];
  const result = verifyToken(token, secret, "own", now);
  return result.ok && result.payload.purpose === "own" ? [...result.payload.orderIds] : [];
}

/** Ký token `own` mới: gộp `orderId` vào danh sách của token cũ (hỏng thì bỏ), hạn 30 ngày từ `now`. */
export function issueOwnToken(
  existingToken: string | undefined,
  orderId: string,
  secret: string,
  now: number,
): string {
  const orderIds = mergeOwnedIds(
    readOwnedIds(existingToken, secret, now),
    orderId,
    MAX_OWNED_ORDERS,
  );
  return signToken({ purpose: "own", exp: now + OWN_PROOF_MAX_AGE_MS, orderIds }, secret);
}
