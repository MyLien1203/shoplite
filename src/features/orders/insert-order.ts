import type { StoreData } from "@/features/store/store-types";
import type { Order } from "./types";

const MAX_ID_ATTEMPTS = 10;

/**
 * Thêm đơn vào store (thuần, dùng trong mutator). Id trùng thì sinh lại Mã đơn từ `createdAt`
 * (tối đa 10 lần), không bao giờ ghi đè.
 */
export function insertOrder(
  data: StoreData,
  order: Order,
  generateId: (date: Date) => string,
): { data: StoreData; order: Order } {
  const taken = new Set(data.orders.map((item) => item.id));
  let id = order.id;
  for (let attempt = 0; taken.has(id); attempt++) {
    if (attempt >= MAX_ID_ATTEMPTS) {
      throw new Error("Không sinh được Mã đơn không trùng sau 10 lần thử.");
    }
    id = generateId(new Date(order.createdAt));
  }
  const saved = structuredClone({ ...order, id });
  return {
    data: { ...data, orders: [...data.orders, saved] },
    order: structuredClone(saved),
  };
}
