import { promises as fs } from "node:fs";
import path from "node:path";
import type { StoreGateway } from "@/features/store/store-gateway";
import { insertOrder } from "./insert-order";
import { generateOrderId } from "./order-service";
import type { Order } from "./types";

/** Nơi lưu trữ đơn hàng. Có thể thay bằng database thật mà không đổi order-service. */
export interface OrderRepository {
  findAll(): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
  /**
   * Trả đơn đã lưu. Repository file/in-memory cũ là upsert (theo id); repository store chỉ insert
   * và sinh lại Mã đơn khi trùng, nên đơn trả về có thể mang id khác.
   */
  save(order: Order): Promise<Order>;
}

export const DEFAULT_ORDERS_FILE = path.join(
  process.cwd(),
  "storage",
  "orders.json",
);

/** Lưu đơn hàng vào một file JSON - đủ dùng cho môi trường học tập, không dùng cho production. */
export function createJsonFileOrderRepository(
  filePath: string,
): OrderRepository {
  async function readAll(): Promise<Order[]> {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const data: unknown = JSON.parse(raw);
      return Array.isArray(data) ? (data as Order[]) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async function writeAll(orders: Order[]): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tempFile = `${filePath}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(orders, null, 2), "utf8");
    await fs.rename(tempFile, filePath);
  }

  return {
    findAll: readAll,

    async findById(id) {
      const orders = await readAll();
      return orders.find((order) => order.id === id) ?? null;
    },

    async save(order) {
      const orders = await readAll();
      const index = orders.findIndex((item) => item.id === order.id);
      if (index >= 0) {
        orders[index] = order;
      } else {
        orders.push(order);
      }
      await writeAll(orders);
      return order;
    },
  };
}

/** Repository trong bộ nhớ - dùng cho unit test. */
export function createInMemoryOrderRepository(
  seed: Order[] = [],
): OrderRepository {
  const orders = new Map(
    seed.map((order) => [order.id, structuredClone(order)]),
  );

  return {
    async findAll() {
      return [...orders.values()].map((order) => structuredClone(order));
    },
    async findById(id) {
      const order = orders.get(id);
      return order ? structuredClone(order) : null;
    },
    async save(order) {
      orders.set(order.id, structuredClone(order));
      return structuredClone(order);
    },
  };
}

export interface StoreOrderRepositoryDeps {
  generateId?: (date: Date) => string;
}

/** Repository xây trên StoreGateway; đơn luôn được chuẩn hóa ở biên đọc của store. */
export function createStoreOrderRepository(
  gateway: StoreGateway,
  { generateId = generateOrderId }: StoreOrderRepositoryDeps = {},
): OrderRepository {
  return {
    async findAll() {
      return (await gateway.read()).orders;
    },

    async findById(id) {
      const { orders } = await gateway.read();
      return orders.find((order) => order.id === id) ?? null;
    },

    /** Chỉ insert; id đã có thì sinh lại Mã đơn, không ghi đè. */
    save(order) {
      return gateway.update((data) => {
        const { data: next, order: saved } = insertOrder(
          data,
          order,
          generateId,
        );
        return { data: next, result: saved };
      });
    },
  };
}
