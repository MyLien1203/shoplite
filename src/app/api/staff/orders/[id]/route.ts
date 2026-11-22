import { NextResponse } from "next/server";
import { requireStaffApi } from "@/features/access/require-staff";
import { orderService } from "@/features/orders/server";
import { handleRouteError } from "@/lib/http";

/**
 * GET /api/staff/orders/:id - nhân viên đọc một đơn đầy đủ (kể cả ghi chú nội bộ).
 * Chưa có phiên nhân viên thì 401 trước khi đọc store; id lạ thì 404 ORDER_NOT_FOUND.
 * Cố ý KHÔNG qua toCustomerView (đó là đường dùng chung cho Khách).
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/staff/orders/[id]">) {
  try {
    await requireStaffApi();
    const { id } = await ctx.params;
    return NextResponse.json(await orderService.getOrder(id));
  } catch (error) {
    return handleRouteError(error);
  }
}
