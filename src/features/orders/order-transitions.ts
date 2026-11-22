import { OrderError } from "./order-errors";
import { ORDER_STATUS_LABELS } from "./types";
import type { Order, OrderStatus } from "./types";

export interface TransitionInput {
  trackingCode?: string;
  expectedDeliveryDate?: string;
}

export type StockDelta = { productId: string; delta: number }[];

export type TransitionPlan =
  { kind: "noop" } | { kind: "apply"; order: Order; stockDelta: StockDelta };

/** Bảng chuyển hợp lệ duy nhất (AD-4.1): trạng thái hiện tại -> các đích cho phép. */
const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipping"],
  shipping: ["delivered"],
  delivered: [],
  cancelled: [],
};

/** Xác nhận đơn trừ tồn: một delta âm cho mỗi productId (cộng dồn dòng trùng). */
function confirmStockDelta(order: Order): StockDelta {
  const totals = new Map<string, number>();
  for (const item of order.items) {
    totals.set(item.productId, (totals.get(item.productId) ?? 0) - item.quantity);
  }
  return [...totals.entries()].map(([productId, delta]) => ({ productId, delta }));
}

const TRACKING_MAX = 50;
const TRACKING_FORBIDDEN = /[\p{Cc}\u2028\u2029<>]/u;
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const VN_OFFSET_MS = 7 * 3600_000;

/** Ngày lịch (YYYY-MM-DD) có thật: khứ hồi qua Date.UTC không đổi tháng/ngày. */
function isRealCalendarDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Ngày giờ Việt Nam (UTC+7 cố định) của một mốc ISO, dạng YYYY-MM-DD. */
function vnDateOf(iso: string): string {
  return new Date(Date.parse(iso) + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Chuẩn hóa và kiểm hai trường khi chuyển confirmed -> shipping; gom lỗi từng trường. */
function normalizeShippingInput(
  order: Order,
  input: TransitionInput,
): Pick<TransitionInput, "trackingCode" | "expectedDeliveryDate"> {
  const errors: Record<string, string> = {};
  const result: TransitionInput = {};

  const rawCode: unknown = input.trackingCode;
  if (rawCode !== undefined) {
    if (typeof rawCode !== "string") {
      errors.trackingCode = "Mã vận đơn phải là chuỗi";
    } else {
      const code = rawCode.trim();
      if (code.length > TRACKING_MAX) {
        errors.trackingCode = `Mã vận đơn tối đa ${TRACKING_MAX} ký tự`;
      } else if (TRACKING_FORBIDDEN.test(code)) {
        errors.trackingCode = "Mã vận đơn chứa ký tự không hợp lệ";
      } else if (code !== "") {
        result.trackingCode = code;
      }
    }
  }

  const rawDate: unknown = input.expectedDeliveryDate;
  if (rawDate !== undefined) {
    if (typeof rawDate !== "string") {
      errors.expectedDeliveryDate = "Ngày giao dự kiến phải là chuỗi";
    } else {
      const date = rawDate.trim();
      if (date !== "") {
        if (!DATE_FORMAT.test(date) || !isRealCalendarDate(date)) {
          errors.expectedDeliveryDate = "Ngày giao dự kiến phải có dạng YYYY-MM-DD và có thật";
        } else if (date < vnDateOf(order.createdAt)) {
          errors.expectedDeliveryDate = "Ngày giao dự kiến không được sớm hơn ngày tạo đơn";
        } else {
          result.expectedDeliveryDate = date;
        }
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new OrderError("VALIDATION_ERROR", "Thông tin giao hàng không hợp lệ", errors);
  }
  return result;
}

/** Ở bước khác confirmed -> shipping, trường nào có mặt (kể cả "") là lỗi. */
function rejectShippingFields(input: TransitionInput): void {
  const errors: Record<string, string> = {};
  if (input.trackingCode !== undefined) {
    errors.trackingCode = "Mã vận đơn chỉ nhận khi chuyển sang Đang giao";
  }
  if (input.expectedDeliveryDate !== undefined) {
    errors.expectedDeliveryDate = "Ngày giao dự kiến chỉ nhận khi chuyển sang Đang giao";
  }
  if (Object.keys(errors).length > 0) {
    throw new OrderError("VALIDATION_ERROR", "Thông tin giao hàng không hợp lệ ở bước này", errors);
  }
}

/**
 * Hàm thuần lập kế hoạch đổi trạng thái đơn (AD-4.1, 4.4, 4.5): không I/O, không đồng hồ ngầm.
 * Thứ tự: noop (đích trùng, bỏ qua mọi trường) -> bảng chuyển -> validate mã vận đơn/ngày giao
 * (chỉ nhận ở confirmed -> shipping) -> apply.
 */
export function planTransition(
  order: Order,
  target: OrderStatus,
  input: TransitionInput,
  now: Date,
): TransitionPlan {
  if (target === order.status) {
    return { kind: "noop" };
  }
  if (!ALLOWED_TRANSITIONS[order.status].includes(target)) {
    throw new OrderError(
      "INVALID_STATUS_TRANSITION",
      `Không thể chuyển đơn từ "${ORDER_STATUS_LABELS[order.status]}" sang "${ORDER_STATUS_LABELS[target]}"`,
    );
  }
  let shippingFields: TransitionInput = {};
  if (order.status === "confirmed" && target === "shipping") {
    shippingFields = normalizeShippingInput(order, input);
  } else {
    rejectShippingFields(input);
  }
  const at = now.toISOString();
  return {
    kind: "apply",
    order: {
      ...order,
      ...shippingFields,
      status: target,
      updatedAt: at,
      statusHistory: [...order.statusHistory, { status: target, at }],
    },
    stockDelta:
      order.status === "pending" && target === "confirmed" ? confirmStockDelta(order) : [],
  };
}
