import { NextResponse } from "next/server";
import { getClientKey } from "@/features/access/client-ip";
import {
  assertNotRateLimited,
  type RateLimitTarget,
  recordFailures,
} from "@/features/access/rate-limit-guard";
import { getAccessConfig, getRateLimiter } from "@/features/access/server";
import { signToken } from "@/features/access/signed-token";
import {
  isStaffPasswordValid,
  resolveCookieSecure,
  STAFF_SESSION_MAX_AGE_MS,
} from "@/features/access/staff-login";
import { OrderError } from "@/features/orders/order-errors";
import { handleRouteError } from "@/lib/http";
import { parseWriteRequest } from "@/lib/write-request";

export async function POST(request: Request) {
  try {
    const config = getAccessConfig();
    const body = await parseWriteRequest(request, {
      trustedProxyHops: config.configured ? config.trustedProxyHops : 0,
    });
    if (!config.configured) {
      throw new OrderError(
        "UNAUTHORIZED",
        "Khu vực nhân viên chưa được cấu hình.",
      );
    }

    const limiter = getRateLimiter();
    const ip = getClientKey(request.headers.get("x-forwarded-for"), config.trustedProxyHops);
    const targets: RateLimitTarget[] = [
      { bucket: "login", key: ip },
      { bucket: "login-all", key: "all" },
    ];
    assertNotRateLimited(limiter, targets);

    const password =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).password
        : undefined;
    if (typeof password !== "string") {
      throw new OrderError("VALIDATION_ERROR", "Vui lòng nhập mật khẩu.");
    }
    if (!isStaffPasswordValid(password, config.staffPassword)) {
      recordFailures(limiter, targets);
      throw new OrderError("UNAUTHORIZED", "Mật khẩu không đúng.");
    }

    const exp = Date.now() + STAFF_SESSION_MAX_AGE_MS;
    const token = signToken({ purpose: "staff", exp }, config.sessionSecret);
    const response = NextResponse.json({ ok: true });
    response.cookies.set("sl_staff", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: resolveCookieSecure(request, config),
      path: "/",
      maxAge: STAFF_SESSION_MAX_AGE_MS / 1000,
    });
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
