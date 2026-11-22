import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffApi } from "@/features/access/require-staff";
import { getAccessConfig } from "@/features/access/server";
import { orderService } from "@/features/orders/server";
import { ORDER_STATUSES } from "@/features/orders/types";
import { handleRouteError, jsonError } from "@/lib/http";
import { parseWriteRequest } from "@/lib/write-request";

const bodySchema = z.object({
  target: z.enum(ORDER_STATUSES),
  trackingCode: z.string().optional(),
  expectedDeliveryDate: z.string().optional(),
});

/**
 * POST /api/staff/orders/:id/transition - nhân viên đổi trạng thái đơn,
 * body { target, trackingCode?, expectedDeliveryDate? }.
 * Thứ tự: parseWriteRequest (CSRF) -> phiên nhân viên -> validate body -> orderService.
 * Route chỉ kiểm kiểu chuỗi; độ dài/định dạng/ngày do planTransition kiểm (noop bỏ qua).
 * Lặp tới đúng trạng thái hiện tại vẫn là 200 (không đổi gì).
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/staff/orders/[id]/transition">,
) {
  const { id } = await ctx.params;
  try {
    const config = getAccessConfig();
    const body = await parseWriteRequest(request, {
      trustedProxyHops: config.configured ? config.trustedProxyHops : 0,
    });
    await requireStaffApi();

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "target");
        if (details[key] !== undefined) continue;
        details[key] =
          key === "target" ? `Phải là một trong: ${ORDER_STATUSES.join(", ")}` : "Phải là chuỗi";
      }
      if (Object.keys(details).length === 0) {
        details.target = `Phải là một trong: ${ORDER_STATUSES.join(", ")}`;
      }
      return jsonError(400, "VALIDATION_ERROR", "Dữ liệu chuyển trạng thái không hợp lệ", details);
    }
    const { target, trackingCode, expectedDeliveryDate } = parsed.data;
    return NextResponse.json(
      await orderService.transitionOrder(id, target, { trackingCode, expectedDeliveryDate }),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
