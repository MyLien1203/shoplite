import { getStoreGateway } from "@/features/store/server";
import type { StoreGateway } from "@/features/store/store-gateway";
import { createOrderService } from "./order-service";

/**
 * Gateway lười: chỉ gọi getStoreGateway() (và đọc process.env) khi có thao tác, không lúc import.
 */
const lazyStore: StoreGateway = {
  read: () => getStoreGateway().read(),
  update: (mutator) => getStoreGateway().update(mutator),
};

/**
 * Instance dùng chung của OrderService. Chỉ import file này từ code chạy trên server
 * (Server Component, Route Handler) vì nó đọc/ghi file hệ thống.
 *
 * Nơi lưu: storage/store.json (STORE_FILE); đơn cũ nhập một lần từ ORDERS_FILE.
 */
export const orderService = createOrderService({ store: lazyStore });
