import { randomUUID } from "node:crypto";
import { promises as nodeFs } from "node:fs";
import path from "node:path";
import {
  createSerializedStoreGateway,
  type StoreGateway,
} from "./store-gateway";
import { logEvent } from "@/lib/log";
import {
  createEmptyStore,
  isStoreData,
  type StoreData,
  StoreError,
} from "./store-types";

export type StoreFs = Pick<
  typeof nodeFs,
  "readFile" | "writeFile" | "rename" | "mkdir" | "unlink"
>;

export interface JsonFileStoreOptions {
  /** Tiêm fs giả để test. */
  fs?: StoreFs;
  /** Số lần thử `rename` tối đa khi gặp EPERM/EBUSY. */
  renameAttempts?: number;
  /** Thời gian chờ cơ sở (ms) giữa các lần thử, nhân theo số lần. */
  renameDelayMs?: number;
  /** File đơn cũ (mảng) dùng làm `orders` ban đầu khi chưa có store.json. */
  legacyFile?: string;
  /** Ghi sự kiện nghiệp vụ (mặc định logEvent). */
  log?: (name: string) => void;
}

const RETRYABLE = new Set(["EPERM", "EBUSY"]);

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Lưu store vào một file JSON, ghi qua tmp duy nhất rồi rename. */
export function createJsonFileStoreGateway(
  filePath: string,
  options: JsonFileStoreOptions = {},
): StoreGateway {
  const fs = options.fs ?? nodeFs;
  const attempts = Math.max(1, options.renameAttempts ?? 5);
  const delayMs = options.renameDelayMs ?? 20;

  const log = options.log ?? ((name: string) => logEvent(name));
  let pendingLegacyImport = false;

  async function loadLegacy(legacyFile: string): Promise<StoreData> {
    let raw: string;
    try {
      raw = await fs.readFile(legacyFile, "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT") return createEmptyStore();
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new StoreError(
        "CORRUPT_STORE",
        "File đơn cũ không phải JSON hợp lệ.",
        { cause: error },
      );
    }
    if (!Array.isArray(parsed)) {
      throw new StoreError("CORRUPT_STORE", "File đơn cũ không phải mảng.");
    }
    pendingLegacyImport = true;
    return { ...createEmptyStore(), orders: parsed };
  }

  async function load(): Promise<StoreData> {
    pendingLegacyImport = false;
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        return options.legacyFile
          ? loadLegacy(options.legacyFile)
          : createEmptyStore();
      }
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new StoreError(
        "CORRUPT_STORE",
        "store.json không phải JSON hợp lệ.",
        { cause: error },
      );
    }
    if (!isStoreData(parsed)) {
      throw new StoreError("CORRUPT_STORE", "store.json sai dạng dữ liệu.");
    }
    return parsed;
  }

  async function renameWithRetry(from: string, to: string): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await fs.rename(from, to);
        return;
      } catch (error) {
        const code = errorCode(error);
        if (attempt >= attempts || !code || !RETRYABLE.has(code)) throw error;
        await sleep(delayMs * attempt);
      }
    }
  }

  async function save(data: StoreData): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tempFile = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempFile, JSON.stringify(data, null, 2), "utf8");
      await renameWithRetry(tempFile, filePath);
      if (pendingLegacyImport) {
        pendingLegacyImport = false;
        log("legacy_imported");
      }
    } catch (error) {
      await fs.unlink(tempFile).catch(() => undefined);
      throw error;
    }
  }

  return createSerializedStoreGateway({ load, save });
}
