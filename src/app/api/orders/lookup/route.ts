import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  MAX_OWNED_ORDERS,
  mergeOwnedIds,
  OWN_COOKIE,
  OWN_PROOF_MAX_AGE_MS,
  readOwnedIds,
} from "@/features/access/own-proof";
import { getClientKey } from "@/features/access/client-ip";
import {
  type RateLimitTarget,
  assertNotRateLimited,
  recordFailures,
} from "@/features/access/rate-limit-guard";
import { getAccessConfig, getRateLimiter } from "@/features/access/server";
import { signToken } from "@/features/access/signed-token";
import { resolveCookieSecure } from "@/features/access/staff-login";
import { LOOKUP_NOT_FOUND_MESSAGE } from "@/features/orders/lookup-order";
import { OrderError } from "@/features/orders/order-errors";
import { orderService } from "@/features/orders/server";
import { handleRouteError } from "@/lib/http";
import { logEvent } from "@/lib/log";
import { parseWriteRequest } from "@/lib/write-request";

// Hàng đợi riêng tư: "kiểm khóa -> tra cứu -> ghi lần sai" chạy tuần tự trong tiến trình
// để yêu cầu song song không cùng vượt kiểm khóa trước khi lần sai nào được ghi.
let lookupQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = lookupQueue.then(task, task);
  lookupQueue = run.catch(() => undefined);
  return run;
}

function readString(body: unknown, key: string): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export async function POST(request: Request) {
  try {
    const config = getAccessConfig();
    const body = await parseWriteRequest(request, {
      trustedProxyHops: config.configured ? config.trustedProxyHops : 0,
    });
    const orderId = readString(body, "orderId");
    const phone = readString(body, "phone");
    if (orderId === undefined || phone === undefined) {
      throw new OrderError("VALIDATION_ERROR", "Vui lòng nhập Mã đơn và số điện thoại.");
    }
    if (!config.configured) {
      logEvent("lookup_unconfigured", { code: "SESSION_NOT_CONFIGURED" });
      throw new OrderError("ORDER_NOT_FOUND", LOOKUP_NOT_FOUND_MESSAGE);
    }

    const limiter = getRateLimiter();
    const ip = getClientKey(request.headers.get("x-forwarded-for"), config.trustedProxyHops);
    const targets: RateLimitTarget[] = [
      { bucket: "lookup", key: ip },
      { bucket: "lookup-order", key: orderId.trim().toUpperCase() },
    ];
    const matchedId = await serialize(async () => {
      assertNotRateLimited(limiter, targets);
      try {
        return await orderService.lookupOrder(orderId, phone);
      } catch (error) {
        if (error instanceof OrderError && error.code === "ORDER_NOT_FOUND") {
          recordFailures(limiter, targets);
        }
        throw error;
      }
    });

    const now = Date.now();
    const existing = (await cookies()).get(OWN_COOKIE)?.value;
    const orderIds = mergeOwnedIds(
      readOwnedIds(existing, config.sessionSecret, now),
      matchedId,
      MAX_OWNED_ORDERS,
    );
    const token = signToken(
      { purpose: "own", exp: now + OWN_PROOF_MAX_AGE_MS, orderIds },
      config.sessionSecret,
    );
    const response = NextResponse.json({ orderId: matchedId });
    response.cookies.set(OWN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: resolveCookieSecure(request, config),
      path: "/",
      maxAge: OWN_PROOF_MAX_AGE_MS / 1000,
    });
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
