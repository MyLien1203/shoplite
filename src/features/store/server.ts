import path from "node:path";
import { createJsonFileStoreGateway } from "./json-file-store";
import type { StoreGateway } from "./store-gateway";

const STORE_KEY = Symbol.for("shoplite.store");

type GlobalWithStore = typeof globalThis & { [STORE_KEY]?: StoreGateway };

/**
 * Composition root của store. Chỉ import từ code chạy trên server.
 * Đọc process.env khi được gọi (không phải lúc import); singleton giữ trên globalThis.
 */
export function getStoreGateway(): StoreGateway {
  const holder = globalThis as GlobalWithStore;
  holder[STORE_KEY] ??= createJsonFileStoreGateway(
    process.env.STORE_FILE || path.join(process.cwd(), "storage", "store.json"),
    {
      legacyFile:
        process.env.ORDERS_FILE ||
        path.join(process.cwd(), "storage", "orders.json"),
    },
  );
  return holder[STORE_KEY];
}
