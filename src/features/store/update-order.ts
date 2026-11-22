import { OrderError } from "@/features/orders/order-errors";
import type { Order } from "@/features/orders/types";
import type { StoreData } from "./store-types";

/**
 * Đường sửa đơn duy nhất (AD-2.7): hàm thuần đồng bộ, chỉ dùng bên trong mutator của
 * `StoreGateway.update`. Không đột biến `data`; `fn` nhận một bản sao của đơn.
 *
 * Ví dụ:
 *   update((data) => {
 *     const r = updateOrder(data, id, fn);
 *     return { data: r.data, result: r.order };
 *   });
 */
export function updateOrder(
  data: StoreData,
  id: string,
  fn: (order: Order) => Order,
): { data: StoreData; order: Order } {
  const index = data.orders.findIndex((order) => order.id === id);
  if (index === -1) {
    throw new OrderError("ORDER_NOT_FOUND", `Không tìm thấy đơn hàng "${id}"`);
  }
  const updated = fn(structuredClone(data.orders[index]));
  if (updated.id !== id) {
    throw new Error(`updateOrder không được đổi id của đơn (từ "${id}" sang "${updated.id}")`);
  }
  const orders = data.orders.slice();
  orders[index] = updated;
  return { data: { ...data, orders }, order: structuredClone(updated) };
}
