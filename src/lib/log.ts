const ALLOWED_KEYS = ["productId", "orderId", "code", "bucket"] as const;

/** Nhận khóa bất kỳ để allowlist lọc ở runtime; chỉ khóa trong ALLOWED_KEYS được ghi. */
export type LogFields = Record<string, unknown>;

export type LogWriter = (line: string) => void;

const defaultWriter: LogWriter = (line) => {
  console.log(line);
};

/**
 * Ghi một dòng JSON nghiệp vụ. Chỉ giữ các khóa allowlist (productId, orderId, code, bucket)
 * với giá trị chuỗi hoặc số hữu hạn; mọi thứ khác bị bỏ để không lọt PII.
 */
export function logEvent(
  name: string,
  fields: LogFields = {},
  write: LogWriter = defaultWriter,
): void {
  const entry: Record<string, string | number> = { event: name };
  for (const key of ALLOWED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    const value = fields[key];
    if (
      typeof value === "string" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      entry[key] = value;
    }
  }
  write(JSON.stringify(entry));
}
