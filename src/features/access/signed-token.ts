import { createHmac, timingSafeEqual } from "node:crypto";

export type TokenPurpose = "staff" | "own";

export type TokenPayload =
  | { purpose: "staff"; exp: number }
  | { purpose: "own"; exp: number; orderIds: string[] };

export type VerifyResult = { ok: true; payload: TokenPayload } | { ok: false };

const DIGEST_BYTES = 32;

function sign(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

/** Token dạng base64url(JSON payload) + "." + base64url(HMAC-SHA256). */
export function signToken(payload: TokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${body}.${sign(body, secret).toString("base64url")}`;
}

function isPayload(value: unknown): value is TokenPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.exp !== "number" || !Number.isFinite(record.exp))
    return false;
  if (record.purpose === "staff") return true;
  return (
    record.purpose === "own" &&
    Array.isArray(record.orderIds) &&
    record.orderIds.every((id) => typeof id === "string")
  );
}

/** Verify chữ ký, purpose và hạn (`now` tiêm vào, ms). Mọi nhánh lỗi trả { ok: false }, không ném. */
export function verifyToken(
  token: string,
  secret: string,
  purpose: TokenPurpose,
  now: number,
): VerifyResult {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return { ok: false };
    const [body, signature] = parts;
    const given = Buffer.from(signature, "base64url");
    const expected = sign(body, secret);
    if (given.length !== DIGEST_BYTES || given.length !== expected.length)
      return { ok: false };
    if (given.toString("base64url") !== signature) return { ok: false };
    if (!timingSafeEqual(given, expected)) return { ok: false };
    const payload: unknown = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    );
    if (!isPayload(payload)) return { ok: false };
    if (payload.purpose !== purpose || !(now < payload.exp))
      return { ok: false };
    return { ok: true, payload };
  } catch {
    return { ok: false };
  }
}
