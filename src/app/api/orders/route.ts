import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { issueOwnToken, OWN_COOKIE, OWN_PROOF_MAX_AGE_MS } from "@/features/access/own-proof";
import { requireStaffApi } from "@/features/access/require-staff";
import { getAccessConfig } from "@/features/access/server";
import { resolveCookieSecure } from "@/features/access/staff-login";
import { toCustomerView } from "@/features/orders/customer-view";
import { orderService } from "@/features/orders/server";
import { parseStaffOrderFilter } from "@/features/orders/staff-order-list";
import { handleRouteError, jsonError } from "@/lib/http";
import { logEvent } from "@/lib/log";
import { parseWriteRequest } from "@/lib/write-request";

/**
 * GET /api/orders?status= - danh sách đơn đầy đủ (kể cả `internalNotes`) cho nhân viên.
 * `status`: active (mặc định) | pending | confirmed | shipping | delivered | cancelled | all.
 * Trả `{ orders, counts }`, cũ nhất trước; `counts` tính trên toàn bộ đơn. Sai `status` thì 400.
 * Chưa có Phiên nhân viên thì 401 UNAUTHORIZED (kiểm tra trước, không đọc store).
 */
export async function GET(request: Request) {
  try {
    await requireStaffApi();
    const filter = parseStaffOrderFilter(new URL(request.url).searchParams.getAll("status"));
    const { orders, counts } = await orderService.listStaffOrders(filter);
    return NextResponse.json({ orders, counts });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/orders - tạo đơn hàng mới. Body: PlaceOrderInput (xem checkout-schema.ts).
 * Trả đơn đã lọc `internalNotes` và cấp cookie `sl_own` làm bằng chứng sở hữu (nếu đã cấu hình).
 */
export async function POST(request: Request) {
  try {
    const config = getAccessConfig();
    const body = await parseWriteRequest(request, {
      trustedProxyHops: config.configured ? config.trustedProxyHops : 0,
    });
    if (body === undefined) {
      return jsonError(400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ");
    }

    const order = await orderService.placeOrder(body);
    const response = NextResponse.json(toCustomerView(order), { status: 201 });

    if (config.configured) {
      const existing = (await cookies()).get(OWN_COOKIE)?.value;
      response.cookies.set(
        OWN_COOKIE,
        issueOwnToken(existing, order.id, config.sessionSecret, Date.now()),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: resolveCookieSecure(request, config),
          path: "/",
          maxAge: OWN_PROOF_MAX_AGE_MS / 1000,
        },
      );
    } else {
      logEvent("order_placed_unproven", { code: "SESSION_NOT_CONFIGURED" });
    }
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
