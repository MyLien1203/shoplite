import { createSerializedStoreGateway, type StoreGateway } from "./store-gateway";
import { createEmptyStore, type StoreData } from "./store-types";

/** Store trong bộ nhớ - cùng hợp đồng với adapter JSON, dùng cho test. */
export function createInMemoryStoreGateway(seed?: StoreData): StoreGateway {
  let state: StoreData = seed ? structuredClone(seed) : createEmptyStore();

  return createSerializedStoreGateway({
    async load() {
      return structuredClone(state);
    },
    async save(data) {
      state = structuredClone(data);
    },
  });
}
