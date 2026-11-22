import type { Product } from "@/features/catalog/types";

/** Tồn hữu hiệu: lớp phủ `inventory` thắng (kể cả 0), thiếu khóa thì dùng tồn tĩnh của catalog. */
export function effectiveStock(
  inventory: Record<string, number>,
  product: Pick<Product, "id" | "stock">,
): number {
  return inventory[product.id] ?? product.stock;
}
