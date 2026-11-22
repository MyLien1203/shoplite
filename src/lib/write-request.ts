import { OrderError } from "@/features/orders/order-errors";
import { readJsonBody } from "@/lib/http";

export interface WriteRequestOptions {
  trustedProxyHops: number;
}

function firstValue(header: string | null): string | undefined {
  const first = header?.split(",")[0]?.trim();
  return first ? first : undefined;
}

function originMatchesHost(origin: string, host: string | undefined): boolean {
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Chống CSRF cho route ghi: kiểm Content-Type JSON và Origin (nếu có) khớp Host.
 * Trả body đã parse (undefined nếu JSON hỏng); ném OrderError("VALIDATION_ERROR") nếu không hợp lệ.
 */
export async function parseWriteRequest(
  request: Request,
  { trustedProxyHops }: WriteRequestOptions,
): Promise<unknown> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new OrderError(
      "VALIDATION_ERROR",
      "Content-Type phải là application/json",
    );
  }

  const origin = request.headers.get("origin");
  if (origin !== null) {
    const forwarded =
      trustedProxyHops > 0
        ? firstValue(request.headers.get("x-forwarded-host"))
        : undefined;
    const host = forwarded ?? firstValue(request.headers.get("host"));
    if (!originMatchesHost(origin, host)) {
      throw new OrderError("VALIDATION_ERROR", "Yêu cầu không hợp lệ");
    }
  }

  return readJsonBody(request);
}
