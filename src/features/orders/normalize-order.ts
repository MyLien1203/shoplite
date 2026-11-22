import type { InternalNote, Order, StatusHistoryEntry } from "./types";
import { ORDER_STATUSES } from "./types";

/** Đơn ở dạng cũ: chưa có các trường mới (hoặc có một phần). */
export type LegacyOrder = Omit<
  Order,
  "source" | "statusHistory" | "internalNotes"
> &
  Partial<Pick<Order, "source" | "statusHistory" | "internalNotes">>;

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/** Kiểm cấu trúc tối thiểu để chuẩn hóa được: object, id, status hợp lệ, createdAt/updatedAt hợp lệ. */
export function isNormalizableOrder(value: unknown): value is LegacyOrder {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    record.id !== "" &&
    typeof record.status === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(record.status) &&
    isTimestamp(record.createdAt) &&
    isTimestamp(record.updatedAt)
  );
}

/**
 * Hàm thuần, idempotent: chỉ điền trường còn thiếu, không đổi đầu vào, không đổi `updatedAt`.
 * Đầu vào phải qua `isNormalizableOrder`.
 */
export function normalizeOrder(order: LegacyOrder): Order {
  const copy = structuredClone(order);
  let statusHistory: StatusHistoryEntry[] | undefined = copy.statusHistory;
  if (!statusHistory) {
    statusHistory = [{ status: "pending", at: copy.createdAt }];
    if (copy.status !== "pending")
      statusHistory.push({ status: copy.status, at: copy.updatedAt });
  }
  const internalNotes: InternalNote[] = copy.internalNotes ?? [];
  return {
    ...copy,
    source: copy.source ?? "web",
    statusHistory,
    internalNotes,
  };
}
