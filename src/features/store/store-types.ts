import type { Order } from "@/features/orders/types";

export interface Adjustment {
  id: string;
  productId: string;
  delta: number;
  before: number;
  after: number;
  reason: string;
  relatedOrderId?: string;
  at: string;
}

export interface StoreData {
  schemaVersion: 1;
  orders: Order[];
  inventory: Record<string, number>;
  adjustments: Adjustment[];
}

export function createEmptyStore(): StoreData {
  return { schemaVersion: 1, orders: [], inventory: {}, adjustments: [] };
}

export type StoreErrorCode = "NESTED_UPDATE" | "CORRUPT_STORE";

export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StoreError";
    this.code = code;
  }
}

/** Kiểm tra dữ liệu đã parse có đúng dạng store không (không sửa, không tự điền). */
export function isStoreData(value: unknown): value is StoreData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    Array.isArray(record.orders) &&
    Array.isArray(record.adjustments) &&
    typeof record.inventory === "object" &&
    record.inventory !== null &&
    !Array.isArray(record.inventory)
  );
}
