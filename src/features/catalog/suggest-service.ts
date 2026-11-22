import { products } from "@/data/products";
import { normalizeText } from "@/lib/format";
import type { Product } from "./types";

export const SUGGEST_MIN_LENGTH = 2;
export const SUGGEST_MAX_LENGTH = 50;
export const SUGGEST_LIMIT = 5;

export interface Suggestion {
  slug: string;
  name: string;
  price: number;
  inStock: boolean;
}

export type SuggestResult =
  | { ok: true; suggestions: Suggestion[] }
  | { ok: false; message: string };

/** Từ khóa hợp lệ (đã trim) dài 2–50 ký tự; trả thông báo lỗi nếu không hợp lệ. */
export function validateSuggestQuery(q: string | null | undefined): string | null {
  const length = [...(q ?? "").trim()].length;
  if (length < SUGGEST_MIN_LENGTH || length > SUGGEST_MAX_LENGTH) {
    return `Từ khóa phải dài từ ${SUGGEST_MIN_LENGTH} đến ${SUGGEST_MAX_LENGTH} ký tự`;
  }
  return null;
}

/**
 * Gợi ý tối đa 5 sản phẩm khớp tên/thương hiệu (không dấu, không phân biệt hoa thường).
 * So khớp bằng `includes` trên chuỗi đã chuẩn hóa — ký tự đặc biệt luôn là chữ thường,
 * không bao giờ được dịch thành regex.
 * Thứ tự: còn hàng trước, rồi điểm đánh giá cao, rồi nhiều lượt đánh giá.
 */
export function getSuggestions(
  q: string | null | undefined,
  source: Product[] = products,
): SuggestResult {
  const error = validateSuggestQuery(q);
  if (error) return { ok: false, message: error };

  const terms = normalizeText(q ?? "").split(" ");
  const suggestions = source
    .filter((product) => {
      const haystack = normalizeText(`${product.name} ${product.brand}`);
      return terms.every((term) => haystack.includes(term));
    })
    .sort(
      (a, b) =>
        Number(b.stock > 0) - Number(a.stock > 0) ||
        b.rating - a.rating ||
        b.reviewCount - a.reviewCount,
    )
    .slice(0, SUGGEST_LIMIT)
    .map((product) => ({
      slug: product.slug,
      name: product.name,
      price: product.price,
      inStock: product.stock > 0,
    }));

  return { ok: true, suggestions };
}
