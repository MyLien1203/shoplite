import type { Product } from "@/features/catalog/types";
import { OrderError } from "@/features/orders/order-errors";
import { effectiveStock } from "./effective-stock";

export type StockDeltaKind = "order" | "adjustment";

/** `delta` có dấu: âm là trừ, dương là cộng (đơn vị: số sản phẩm). */
export type StockDelta = { productId: string; delta: number };

export type StockChange = { productId: string; before: number; after: number };

/**
 * Quy tắc thuần cho Tồn kho thực: trả bản `inventory` mới nếu mọi dòng hợp lệ,
 * ngược lại ném `OrderError` và không có kết quả một phần. Không đổi đầu vào.
 */
export function applyStockDelta(
  inventory: Record<string, number>,
  catalog: readonly Pick<Product, "id" | "name" | "stock">[],
  deltas: readonly StockDelta[],
  kind: StockDeltaKind,
): { inventory: Record<string, number>; changes: StockChange[] } {
  for (const { delta } of deltas) {
    if (!Number.isInteger(delta)) {
      throw new OrderError("VALIDATION_ERROR", "Số lượng thay đổi tồn kho không hợp lệ.");
    }
  }

  // Map giữ thứ tự chèn = thứ tự xuất hiện đầu tiên của từng productId.
  const merged = new Map<string, number>();
  for (const { productId, delta } of deltas) {
    merged.set(productId, (merged.get(productId) ?? 0) + delta);
  }

  const next: Record<string, number> = { ...inventory };
  const changes: StockChange[] = [];

  for (const [productId, delta] of merged) {
    const product = catalog.find((p) => p.id === productId);
    if (!product) {
      throw new OrderError("PRODUCT_NOT_FOUND", `Không tìm thấy sản phẩm "${productId}"`);
    }
    if (delta === 0) continue;

    const before = effectiveStock(inventory, product);
    const after = before + delta;
    if (after < 0) {
      if (kind === "order") {
        throw new OrderError(
          "INSUFFICIENT_STOCK",
          before <= 0
            ? `Sản phẩm "${product.name}" đã hết hàng`
            : `Sản phẩm "${product.name}" chỉ còn ${before} sản phẩm`,
        );
      }
      throw new OrderError("VALIDATION_ERROR", `Tồn kho của "${product.name}" không thể âm.`);
    }

    next[productId] = after;
    changes.push({ productId, before, after });
  }

  return { inventory: next, changes };
}
