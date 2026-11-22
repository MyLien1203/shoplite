import {
  isNormalizableOrder,
  normalizeOrder,
} from "@/features/orders/normalize-order";
import { type StoreData, StoreError } from "./store-types";

/** Hàm thuần đồng bộ: nhận dữ liệu store, trả dữ liệu mới và kết quả cho người gọi. */
export type StoreMutator<T> = (data: StoreData) => {
  data: StoreData;
  result: T;
};

export interface StoreGateway {
  /** Trả bản sao của store; đi qua cùng chuỗi tuần tự với update. */
  read(): Promise<StoreData>;
  /** Chạy mutator tuần tự; mutator ném lỗi thì không ghi gì. */
  update<T>(mutator: StoreMutator<T>): Promise<T>;
}

/** Lớp I/O mà bộ chạy tuần tự dùng; adapter chỉ cần cài đặt hai hàm này. */
export interface StoreIo {
  load(): Promise<StoreData>;
  save(data: StoreData): Promise<void>;
}

/** Chuẩn hóa đơn tại biên đọc; đơn hỏng cấu trúc thì cả store hỏng (chỉ nêu chỉ số, không PII). */
function normalizeStore(data: StoreData): StoreData {
  const orders = data.orders.map((order: unknown, index) => {
    if (!isNormalizableOrder(order)) {
      throw new StoreError(
        "CORRUPT_STORE",
        `Đơn hàng ở vị trí ${index} sai dạng dữ liệu.`,
      );
    }
    return normalizeOrder(order);
  });
  return { ...data, orders };
}

/** Tạo gateway chạy mọi read/update tuần tự bằng chuỗi promise, chống update lồng. */
export function createSerializedStoreGateway(io: StoreIo): StoreGateway {
  let tail: Promise<unknown> = Promise.resolve();
  let mutatorRunning = false;

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    read() {
      return enqueue(async () =>
        structuredClone(normalizeStore(await io.load())),
      );
    },

    update<T>(mutator: StoreMutator<T>): Promise<T> {
      if (mutatorRunning) {
        return Promise.reject(
          new StoreError(
            "NESTED_UPDATE",
            "Không được gọi update bên trong mutator đang chạy.",
          ),
        );
      }
      return enqueue(async () => {
        const current = normalizeStore(await io.load());
        let outcome: { data: StoreData; result: T };
        mutatorRunning = true;
        try {
          outcome = mutator(current);
        } finally {
          mutatorRunning = false;
        }
        await io.save(outcome.data);
        return outcome.result;
      });
    },
  };
}
