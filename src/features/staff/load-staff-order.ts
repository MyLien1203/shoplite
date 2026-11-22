import type { Order } from "@/features/orders/types";

export type LoadStaffOrderResult =
  | { kind: "ok"; order: Order }
  | { kind: "unauthorized" }
  | { kind: "not_found" }
  | { kind: "error" };

function isOrderLike(body: unknown): body is Order {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.id === "string" &&
    Array.isArray(b.items) &&
    Array.isArray(b.statusHistory) &&
    Array.isArray(b.internalNotes)
  );
}

/**
 * Tải một đơn đầy đủ cho nhân viên. Trả `null` khi bị hủy (AbortError) để nơi gọi bỏ qua im lặng.
 */
export async function loadStaffOrder(
  id: string,
  signal?: AbortSignal,
): Promise<LoadStaffOrderResult | null> {
  try {
    const res = await fetch(`/api/staff/orders/${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal,
    });
    if (res.status === 401) return { kind: "unauthorized" };
    if (res.status === 404) return { kind: "not_found" };
    if (!res.ok) return { kind: "error" };
    const body: unknown = await res.json();
    if (!isOrderLike(body)) return { kind: "error" };
    return { kind: "ok", order: body };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    return { kind: "error" };
  }
}
