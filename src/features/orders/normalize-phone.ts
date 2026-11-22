import { VN_PHONE_REGEX } from "@/features/checkout/checkout-schema";

/**
 * Chuẩn hóa SĐT về dạng 0xxxxxxxxx: bỏ khoảng trắng và `.`, `-`, `(`, `)`; `+84` đổi thành `0`.
 * Trả `null` khi rỗng hoặc sai định dạng.
 */
export function normalizePhone(input: string): string | null {
  const stripped = input.replace(/[\s.\-()]/g, "");
  const canonical = stripped.startsWith("+84") ? `0${stripped.slice(3)}` : stripped;
  return VN_PHONE_REGEX.test(canonical) ? canonical : null;
}
