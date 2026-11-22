import { NextResponse } from "next/server";
import { assertCanViewOrder } from "@/features/access/current-actor";
import { getAccessConfig } from "@/features/access/server";
import { toCustomerView } from "@/features/orders/customer-view";
import { orderService } from "@/features/orders/server";
import { handleRouteError, jsonError } from "@/lib/http";
import { parseWriteRequest } from "@/lib/write-request";

/** GET /api/orders/:id - chỉ nhân viên hoặc chủ đơn; người khác nhận 404 chung. */
export async function GET(_request: Request, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  try {
    await assertCanViewOrder(id);
    return NextResponse.json(toCustomerView(await orderService.getOrder(id)));
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/orders/:id - chủ đơn hoặc nhân viên hủy đơn đang Chờ xác nhận.
 * Thứ tự: parseWriteRequest (CSRF, đọc/parse body) -> quyền (404 chung) -> kiểm
 * body { "status": "cancelled" } -> ghi.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  try {
    const config = getAccessConfig();
    const body = await parseWriteRequest(request, {
      trustedProxyHops: config.configured ? config.trustedProxyHops : 0,
    });
    await assertCanViewOrder(id);
    if (body === undefined) {
      return jsonError(400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ");
    }
    if ((body as { status?: unknown } | null)?.status !== "cancelled") {
      return jsonError(400, "VALIDATION_ERROR", 'Chỉ hỗ trợ cập nhật { "status": "cancelled" }');
    }
    return NextResponse.json(toCustomerView(await orderService.cancelByCustomer(id)));
  } catch (error) {
    return handleRouteError(error);
  }
}
