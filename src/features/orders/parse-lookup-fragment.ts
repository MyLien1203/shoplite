import { normalizePhone } from "@/features/orders/normalize-phone";

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function splitPairs(hash: string): { rawKey: string; rawValue: string }[] {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  if (body === "") return [];
  return body.split("&").map((part) => {
    const index = part.indexOf("=");
    return index === -1
      ? { rawKey: part, rawValue: "" }
      : { rawKey: part.slice(0, index), rawValue: part.slice(index + 1) };
  });
}

/** Fragment có khóa `code` hoặc `phone` (kể cả khi giá trị rỗng hoặc sai). */
export function hasLookupKeys(hash: string): boolean {
  return splitPairs(hash).some(({ rawKey }) => {
    const key = safeDecode(rawKey) ?? rawKey;
    return key === "code" || key === "phone";
  });
}

/**
 * Phân tích Liên kết tra cứu `#code=…&phone=…`. Dùng `decodeURIComponent` (không dùng
 * `URLSearchParams`) để `+` trần giữ nguyên. Khóa lặp lấy lần đầu. Không hợp lệ thì `null`.
 */
export function parseLookupFragment(hash: string): { orderId: string; phone: string } | null {
  const found: Record<string, string> = {};
  for (const { rawKey, rawValue } of splitPairs(hash)) {
    const key = safeDecode(rawKey);
    if (key !== "code" && key !== "phone") continue;
    if (key in found) continue;
    const value = safeDecode(rawValue);
    if (value === null) return null;
    found[key] = value;
  }
  const orderId = found.code?.trim();
  const phone = found.phone?.trim();
  if (!orderId || phone === undefined || normalizePhone(phone) === null) return null;
  return { orderId, phone };
}
