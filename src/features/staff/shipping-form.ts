export interface ShippingFormInput {
  trackingCode: string;
  expectedDeliveryDate: string;
}

export type ShippingFieldKey = "trackingCode" | "expectedDeliveryDate";

export interface ShippingFormResult {
  values: { trackingCode?: string; expectedDeliveryDate?: string };
  errors: { trackingCode?: string; expectedDeliveryDate?: string };
}

const TRACKING_MAX = 50;
const TRACKING_FORBIDDEN = /[\p{Cc}\u2028\u2029<>\p{Cf}]/u;
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const VN_OFFSET_MS = 7 * 3600_000;

/** Ngày giờ Việt Nam (UTC+7 cố định) của một mốc ISO, dạng YYYY-MM-DD; `null` khi không đọc được. */
export function vnDateOf(createdAt: string): string | null {
  const time = Date.parse(createdAt);
  if (!Number.isFinite(time)) return null;
  const shifted = new Date(time + VN_OFFSET_MS);
  if (Number.isNaN(shifted.getTime())) return null;
  return shifted.toISOString().slice(0, 10);
}

/** Kiểm form giao hàng ở client, phản chiếu quy tắc của API 2.5. Hàm thuần. */
export function validateShippingForm(
  input: ShippingFormInput,
  createdAt: string,
): ShippingFormResult {
  const values: ShippingFormResult["values"] = {};
  const errors: ShippingFormResult["errors"] = {};

  const code = input.trackingCode.trim();
  if (code.length > TRACKING_MAX) {
    errors.trackingCode = `Mã vận đơn tối đa ${TRACKING_MAX} ký tự.`;
  } else if (TRACKING_FORBIDDEN.test(code)) {
    errors.trackingCode = "Mã vận đơn chứa ký tự không hợp lệ.";
  } else if (code !== "") {
    values.trackingCode = code;
  }

  const date = input.expectedDeliveryDate.trim();
  if (date !== "") {
    const min = vnDateOf(createdAt);
    if (!DATE_FORMAT.test(date)) {
      errors.expectedDeliveryDate = "Ngày giao dự kiến không hợp lệ.";
    } else if (min !== null && date < min) {
      errors.expectedDeliveryDate = "Ngày giao dự kiến không được sớm hơn ngày đặt hàng.";
    } else {
      values.expectedDeliveryDate = date;
    }
  }

  return { values, errors };
}
