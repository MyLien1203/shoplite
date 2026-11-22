import { cookies } from "next/headers";
import { LOOKUP_NOT_FOUND_MESSAGE } from "@/features/orders/lookup-order";
import { OrderError } from "@/features/orders/order-errors";
import { type Actor, canAccessOrder, resolveActor } from "./actor";
import { OWN_COOKIE } from "./own-proof";
import { getAccessConfig } from "./server";

/** Người đang gọi, đọc từ cookie của request; chưa cấu hình hoặc cookie hỏng thì `anonymous`. */
export async function getCurrentActor(): Promise<Actor> {
  const config = getAccessConfig();
  if (!config.configured) return { kind: "anonymous" };
  const store = await cookies();
  return resolveActor(
    { sl_staff: store.get("sl_staff")?.value, sl_own: store.get(OWN_COOKIE)?.value },
    config.sessionSecret,
    Date.now(),
  );
}

/** Ném ORDER_NOT_FOUND (lời chung) khi người gọi không có quyền xem đơn `orderId`. */
export async function assertCanViewOrder(orderId: string): Promise<void> {
  if (!canAccessOrder(await getCurrentActor(), orderId)) {
    throw new OrderError("ORDER_NOT_FOUND", LOOKUP_NOT_FOUND_MESSAGE);
  }
}
