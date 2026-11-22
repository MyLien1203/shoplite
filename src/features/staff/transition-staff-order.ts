import type { Order, OrderStatus } from "@/features/orders/types";
import { ORDER_STATUSES } from "@/features/orders/types";

export type TransitionStaffOrderResult =
  | { kind: "ok"; order: Order }
  | { kind: "unauthorized" }
  | { kind: "stock"; message: string }
  | { kind: "stale" }
  | { kind: "invalid"; message: string; details: TransitionDetails }
  | { kind: "error"; message: string };

type TransitionDetails = Partial<Record<"trackingCode" | "expectedDeliveryDate", string>>;

export interface TransitionExtra {
  trackingCode?: string;
  expectedDeliveryDate?: string;
}

const DETAIL_KEYS = ["trackingCode", "expectedDeliveryDate"] as const;

const NETWORK_MESSAGE = "Không kết nối được máy chủ, vui lòng thử lại.";
const GENERIC_MESSAGE = "Không thể cập nhật đơn, vui lòng thử lại.";

function isOrderLike(value: unknown): value is Order {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { id?: unknown; status?: unknown };
  return (
    typeof candidate.id === "string" &&
    typeof candidate.status === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(candidate.status)
  );
}

function readError(body: unknown): { code?: string; message?: string } {
  if (typeof body !== "object" || body === null || !("error" in body)) return {};
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null) return {};
  const { code, message } = error as { code?: unknown; message?: unknown };
  return {
    code: typeof code === "string" ? code : undefined,
    message: typeof message === "string" ? message : undefined,
  };
}

function readDetails(body: unknown): TransitionDetails | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null || !("details" in error)) return null;
  const details = (error as { details: unknown }).details;
  if (typeof details !== "object" || details === null || Array.isArray(details)) return null;
  const result: TransitionDetails = {};
  for (const key of DETAIL_KEYS) {
    const value = (details as Record<string, unknown>)[key];
    if (typeof value === "string") result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Gọi API đổi trạng thái đơn bằng một cú bấm (chỉ gửi `target`). Trả `null` khi bị hủy
 * (AbortError) để nơi gọi bỏ qua im lặng.
 */
export async function transitionStaffOrder(
  id: string,
  target: OrderStatus,
  signal?: AbortSignal,
  extra?: TransitionExtra,
): Promise<TransitionStaffOrderResult | null> {
  const payload: { target: OrderStatus } & TransitionExtra = { target };
  if (extra?.trackingCode !== undefined) payload.trackingCode = extra.trackingCode;
  if (extra?.expectedDeliveryDate !== undefined) {
    payload.expectedDeliveryDate = extra.expectedDeliveryDate;
  }
  let res: Response;
  try {
    res = await fetch("/api/staff/orders/" + encodeURIComponent(id) + "/transition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (isAbort(error)) return null;
    return { kind: "error", message: NETWORK_MESSAGE };
  }

  if (res.status === 401) return { kind: "unauthorized" };

  let body: unknown;
  try {
    body = await res.json();
  } catch (error) {
    if (isAbort(error)) return null;
    body = undefined;
  }

  if (res.status === 200) {
    return isOrderLike(body)
      ? { kind: "ok", order: body }
      : { kind: "error", message: GENERIC_MESSAGE };
  }
  const { code, message } = readError(body);
  if (res.status === 409 && code === "INSUFFICIENT_STOCK") {
    return { kind: "stock", message: message ?? GENERIC_MESSAGE };
  }
  if (
    (res.status === 409 && code === "INVALID_STATUS_TRANSITION") ||
    (res.status === 404 && code === "ORDER_NOT_FOUND")
  ) {
    return { kind: "stale" };
  }
  if (res.status === 400 && code === "VALIDATION_ERROR") {
    const details = readDetails(body);
    if (details) return { kind: "invalid", message: message ?? GENERIC_MESSAGE, details };
  }
  return { kind: "error", message: GENERIC_MESSAGE };
}
