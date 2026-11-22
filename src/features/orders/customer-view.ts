import type { CustomerOrderView, Order } from "./types";

/** Loại `internalNotes` khỏi đơn trước khi trả cho Khách (kể cả khi người gọi là nhân viên). */
export function toCustomerView(order: Order): CustomerOrderView {
  const view: Partial<Order> = { ...order };
  delete view.internalNotes;
  return view as CustomerOrderView;
}
