import { getProductById } from "@/features/catalog/catalog-service";
import type { Product } from "@/features/catalog/types";
import { placeOrderSchema, toFieldErrors } from "@/features/checkout/checkout-schema";
import { calculateOrderTotals } from "@/features/checkout/pricing";
import { effectiveStock } from "@/features/inventory/effective-stock";
import { applyStockDelta } from "@/features/inventory/stock-rules";
import { logEvent as defaultLogEvent, type LogFields } from "@/lib/log";
import type { StoreGateway } from "@/features/store/store-gateway";
import { updateOrder } from "@/features/store/update-order";
import { LOOKUP_NOT_FOUND_MESSAGE, matchOrderForLookup } from "./lookup-order";
import { OrderError } from "./order-errors";
import { insertOrder } from "./insert-order";
import {
  planTransition,
  type StockDelta,
  type TransitionInput,
  type TransitionPlan,
} from "./order-transitions";
import { buildStaffOrderList, type StaffOrderFilter } from "./staff-order-list";
import type { Order, OrderItem, OrderStatus } from "./types";

export interface OrderServiceDeps {
  store: StoreGateway;
  findProduct?: (id: string) => Product | undefined;
  now?: () => Date;
  generateId?: (date: Date) => string;
  logEvent?: (name: string, fields: LogFields) => void;
}

/** Mã đơn hàng dạng SL-20261021-4F9A2C */
export function generateOrderId(date: Date): string {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `SL-${ymd}-${random}`;
}

/** Gộp các dòng trùng productId: [{p1, 2}, {p1, 1}] -> [{p1, 3}] */
function mergeItems(items: { productId: string; quantity: number }[]) {
  const merged = new Map<string, number>();
  for (const item of items) {
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  }
  return [...merged.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

export function createOrderService({
  store,
  findProduct = getProductById,
  now = () => new Date(),
  generateId = generateOrderId,
  logEvent = defaultLogEvent,
}: OrderServiceDeps) {
  async function getOrder(id: string): Promise<Order> {
    const { orders } = await store.read();
    const order = orders.find((item) => item.id === id);
    if (!order) {
      throw new OrderError("ORDER_NOT_FOUND", `Không tìm thấy đơn hàng "${id}"`);
    }
    return order;
  }

  return {
    /**
     * Tạo đơn hàng mới từ payload của client, trong MỘT store.update:
     * - Validate dữ liệu bằng placeOrderSchema (trước update)
     * - Lấy giá từ catalog (bỏ qua mọi giá client gửi lên)
     * - Kiểm tra tồn kho hữu hiệu (không trừ tồn)
     */
    async placeOrder(input: unknown): Promise<Order> {
      const parsed = placeOrderSchema.safeParse(input);
      if (!parsed.success) {
        throw new OrderError(
          "VALIDATION_ERROR",
          "Thông tin đơn hàng không hợp lệ",
          toFieldErrors(parsed.error),
        );
      }

      const { customer, items, shippingMethod, paymentMethod } = parsed.data;
      const createdAt = now();
      const createdAtIso = createdAt.toISOString();

      return store.update((data) => {
        const orderItems: OrderItem[] = mergeItems(items).map(({ productId, quantity }) => {
          const product = findProduct(productId);
          if (!product) {
            throw new OrderError("PRODUCT_NOT_FOUND", `Không tìm thấy sản phẩm "${productId}"`);
          }
          const stock = effectiveStock(data.inventory, product);
          if (quantity > stock) {
            throw new OrderError(
              "INSUFFICIENT_STOCK",
              stock === 0
                ? `Sản phẩm "${product.name}" đã hết hàng`
                : `Sản phẩm "${product.name}" chỉ còn ${stock} sản phẩm`,
            );
          }
          return {
            productId: product.id,
            slug: product.slug,
            name: product.name,
            image: product.image,
            unitPrice: product.price,
            quantity,
            lineTotal: product.price * quantity,
          };
        });

        const order: Order = {
          id: generateId(createdAt),
          status: "pending",
          createdAt: createdAtIso,
          updatedAt: createdAtIso,
          customer: {
            fullName: customer.fullName,
            phone: customer.phone,
            email: customer.email || undefined,
            address: customer.address,
            note: customer.note || undefined,
          },
          shippingMethod,
          paymentMethod,
          items: orderItems,
          ...calculateOrderTotals(orderItems, shippingMethod),
          source: "web",
          statusHistory: [{ status: "pending", at: createdAtIso }],
          internalNotes: [],
        };

        const inserted = insertOrder(data, order, generateId);
        return { data: inserted.data, result: inserted.order };
      });
    },

    /** Danh sách đơn hàng, mới nhất trước. */
    async listOrders(): Promise<Order[]> {
      const { orders } = await store.read();
      return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    /** Danh sách cho nhân viên: lọc, cũ nhất trước, kèm số đếm toàn store (AD-4.6). Chỉ đọc. */
    async listStaffOrders(filter: StaffOrderFilter) {
      const { orders } = await store.read();
      return buildStaffOrderList(orders, filter);
    },

    getOrder,

    /** Tra cứu bằng Mã đơn + SĐT: trả Mã đơn lưu trong store, không khớp thì 404 chung. */
    async lookupOrder(orderId: string, phone: string): Promise<string> {
      const { orders } = await store.read();
      const matched = matchOrderForLookup(orders, orderId, phone);
      if (matched === null) {
        throw new OrderError("ORDER_NOT_FOUND", LOOKUP_NOT_FOUND_MESSAGE);
      }
      return matched;
    },

    /**
     * Đường Khách hủy đơn (AD-4.1, 4.2): một store.update, bảng chuyển nằm ở planTransition.
     * Hủy lặp (noop) hoặc sai bước đều là 409 với lời HC-1 (khác đường nhân viên).
     * Không trừ hay hoàn kho (đơn pending chưa trừ tồn). Đổi sang trạng thái khác thuộc API nhân viên.
     */
    async cancelByCustomer(id: string): Promise<Order> {
      return store.update((data) => {
        const { data: next, order } = updateOrder(data, id, (current) => {
          const rejected = () =>
            new OrderError(
              "INVALID_STATUS_TRANSITION",
              "Chỉ có thể hủy đơn hàng đang ở trạng thái Chờ xác nhận",
            );
          let plan: TransitionPlan;
          try {
            plan = planTransition(current, "cancelled", {}, now());
          } catch (error) {
            if (error instanceof OrderError && error.code === "INVALID_STATUS_TRANSITION") {
              throw rejected();
            }
            throw error;
          }
          if (plan.kind === "noop") {
            throw rejected();
          }
          return plan.order;
        });
        return { data: next, result: order };
      });
    },

    /**
     * Đường nhân viên đổi trạng thái (AD-2.7, 4.2, 4.3): một store.update chạy planTransition,
     * applyStockDelta và lưu đơn. Đích trùng trạng thái hiện tại (noop) trả đơn y nguyên.
     * Thiếu tồn khi xác nhận thì không ghi gì; log `confirm_rejected_stock` sau khi update bị từ chối.
     */
    async transitionOrder(
      id: string,
      target: OrderStatus,
      input: TransitionInput = {},
    ): Promise<Order> {
      const at = now();
      let shortProductId: string | undefined;
      try {
        return await store.update((data) => {
          let stockDelta: StockDelta = [];
          const { data: next, order } = updateOrder(data, id, (current) => {
            const plan = planTransition(current, target, input, at);
            if (plan.kind === "noop") {
              return current;
            }
            stockDelta = plan.stockDelta;
            return plan.order;
          });
          if (stockDelta.length === 0) {
            return { data: next, result: order };
          }

          const catalog: Product[] = [];
          for (const { productId } of stockDelta) {
            const product = findProduct(productId);
            if (product) catalog.push(product);
          }
          try {
            const { inventory } = applyStockDelta(next.inventory, catalog, stockDelta, "order");
            return { data: { ...next, inventory }, result: order };
          } catch (error) {
            if (error instanceof OrderError && error.code === "INSUFFICIENT_STOCK") {
              shortProductId = stockDelta.find(({ productId, delta }) => {
                const product = catalog.find((p) => p.id === productId);
                return product !== undefined && effectiveStock(next.inventory, product) + delta < 0;
              })?.productId;
            }
            throw error;
          }
        });
      } catch (error) {
        if (shortProductId !== undefined) {
          logEvent("confirm_rejected_stock", { productId: shortProductId });
        }
        throw error;
      }
    },
  };
}

export type OrderService = ReturnType<typeof createOrderService>;
