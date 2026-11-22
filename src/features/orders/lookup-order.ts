import { createHash, timingSafeEqual } from "node:crypto";
import { normalizePhone } from "./normalize-phone";
import type { Order } from "./types";

export const LOOKUP_NOT_FOUND_MESSAGE =
  "Không tìm thấy đơn hàng. Kiểm tra lại Mã đơn và số điện thoại.";

function sha(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Khớp Mã đơn + SĐT với danh sách đơn; trả Mã đơn lưu trong store hoặc `null`.
 * Chỉ phép so sánh cuối là cố định: luôn băm SĐT và gọi `timingSafeEqual` kể cả khi không có
 * đơn (giá trị giả). Việc tìm đơn và chuẩn hóa SĐT phía đơn vẫn có thể thoát sớm.
 */
export function matchOrderForLookup(
  orders: readonly Order[],
  orderId: string,
  phone: string,
): string | null {
  const wanted = orderId.trim().toUpperCase();
  const order = orders.find((item) => item.id.toUpperCase() === wanted);
  const given = normalizePhone(phone);
  const expected = order ? normalizePhone(order.customer.phone) : null;
  const same = timingSafeEqual(sha(given ?? "x"), sha(expected ?? "y"));
  return order && given !== null && expected !== null && same ? order.id : null;
}
