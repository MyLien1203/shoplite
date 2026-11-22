// @vitest-environment node
import { promises as realFs } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Order } from "@/features/orders/types";
import { createJsonFileStoreGateway, type StoreFs } from "./json-file-store";
import { createEmptyStore, type StoreData, StoreError } from "./store-types";

const order = (id: string): Order => ({
  id,
  status: "pending",
  createdAt: "2026-10-21T03:00:00.000Z",
  updatedAt: "2026-10-21T03:00:00.000Z",
  customer: { fullName: "A", phone: "0901234567", address: "1 Trần Phú" },
  shippingMethod: "standard",
  paymentMethod: "cod",
  items: [],
  subtotal: 0,
  shippingFee: 0,
  total: 0,
  source: "web",
  statusHistory: [{ status: "pending", at: "2026-10-21T03:00:00.000Z" }],
  internalNotes: [],
});

const addOrder = (id: string) => (data: StoreData) => ({
  data: { ...data, orders: [...data.orders, order(id)] },
  result: id,
});

describe("createJsonFileStoreGateway", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "shoplite-store-"));
    file = path.join(dir, "nested", "store.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("file chưa tồn tại: read trả store rỗng và không tạo file", async () => {
    const gateway = createJsonFileStoreGateway(file);
    expect(await gateway.read()).toEqual(createEmptyStore());
    await expect(readFile(file, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("ghi thành công: file = data, trả result, không để lại tmp", async () => {
    const gateway = createJsonFileStoreGateway(file);
    expect(await gateway.update(addOrder("SL-1"))).toBe("SL-1");
    const onDisk = JSON.parse(await readFile(file, "utf8")) as StoreData;
    expect(onDisk.orders.map((o) => o.id)).toEqual(["SL-1"]);
    expect(await readdir(path.dirname(file))).toEqual(["store.json"]);
  });

  it("update tuần tự: mutator sau thấy kết quả mutator trước", async () => {
    const gateway = createJsonFileStoreGateway(file);
    const seen: number[] = [];
    const first = gateway.update((data) => {
      seen.push(data.orders.length);
      return addOrder("SL-1")(data);
    });
    const second = gateway.update((data) => {
      seen.push(data.orders.length);
      return addOrder("SL-2")(data);
    });
    await Promise.all([first, second]);
    expect(seen).toEqual([0, 1]);
  });

  it("Promise.all hai update trên JSON thật: cả hai đơn đều có", async () => {
    const gateway = createJsonFileStoreGateway(file);
    await Promise.all([
      gateway.update(addOrder("SL-1")),
      gateway.update(addOrder("SL-2")),
    ]);
    const onDisk = JSON.parse(await readFile(file, "utf8")) as StoreData;
    expect(onDisk.orders.map((o) => o.id).sort()).toEqual(["SL-1", "SL-2"]);
  });

  it("mutator ném: không ghi file, ném lại lỗi gốc, update kế tiếp vẫn chạy", async () => {
    const gateway = createJsonFileStoreGateway(file);
    const boom = new Error("boom");
    await expect(
      gateway.update(() => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    await expect(readFile(file, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await gateway.update(addOrder("SL-1"))).toBe("SL-1");
  });

  it("update lồng bị từ chối, mutator ngoài không hỏng", async () => {
    const gateway = createJsonFileStoreGateway(file);
    let nested: Promise<unknown> | undefined;
    const result = await gateway.update((data) => {
      nested = gateway.update(addOrder("SL-X"));
      nested.catch(() => undefined);
      return addOrder("SL-1")(data);
    });
    expect(result).toBe("SL-1");
    await expect(nested).rejects.toMatchObject({ code: "NESTED_UPDATE" });
    expect((await gateway.read()).orders.map((o) => o.id)).toEqual(["SL-1"]);
  });

  it("read gọi khi update đang chờ được xếp sau update và thấy dữ liệu đã ghi", async () => {
    const gateway = createJsonFileStoreGateway(file);
    const pending = gateway.update(addOrder("SL-1"));
    const snapshot = gateway.read();
    await pending;
    expect((await snapshot).orders.map((o) => o.id)).toEqual(["SL-1"]);
  });

  it("read trả bản sao: sửa kết quả không đổi store", async () => {
    const gateway = createJsonFileStoreGateway(file);
    await gateway.update(addOrder("SL-1"));
    const copy = await gateway.read();
    copy.orders.push(order("SL-2"));
    expect((await gateway.read()).orders).toHaveLength(1);
  });

  it("JSON sai: read và update ném CORRUPT_STORE, file giữ nguyên", async () => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "{ not json", "utf8");
    const gateway = createJsonFileStoreGateway(file);
    await expect(gateway.read()).rejects.toMatchObject({
      code: "CORRUPT_STORE",
    });
    await expect(gateway.update(addOrder("SL-1"))).rejects.toBeInstanceOf(
      StoreError,
    );
    expect(await readFile(file, "utf8")).toBe("{ not json");
  });

  it.each([
    ["rỗng 0 byte", ""],
    [
      "schemaVersion khác 1",
      JSON.stringify({ ...createEmptyStore(), schemaVersion: 2 }),
    ],
    [
      "thiếu orders",
      JSON.stringify({ schemaVersion: 1, inventory: {}, adjustments: [] }),
    ],
    [
      "thiếu inventory",
      JSON.stringify({ schemaVersion: 1, orders: [], adjustments: [] }),
    ],
    [
      "thiếu adjustments",
      JSON.stringify({ schemaVersion: 1, orders: [], inventory: {} }),
    ],
    ["mảng", "[]"],
    ["null", "null"],
    ["chuỗi", '"x"'],
  ])(
    "file sai dạng (%s): CORRUPT_STORE, file giữ nguyên",
    async (_name, content) => {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content, "utf8");
      const gateway = createJsonFileStoreGateway(file);
      await expect(gateway.read()).rejects.toMatchObject({
        code: "CORRUPT_STORE",
      });
      await expect(gateway.update(addOrder("SL-1"))).rejects.toMatchObject({
        code: "CORRUPT_STORE",
      });
      expect(await readFile(file, "utf8")).toBe(content);
    },
  );

  it("thử lại rename khi EPERM/EBUSY rồi thành công", async () => {
    let calls = 0;
    const fakeFs: StoreFs = {
      ...realFs,
      rename: async (from, to) => {
        calls++;
        if (calls < 3) {
          throw Object.assign(new Error("busy"), {
            code: calls === 1 ? "EPERM" : "EBUSY",
          });
        }
        return realFs.rename(from, to);
      },
    };
    const gateway = createJsonFileStoreGateway(file, {
      fs: fakeFs,
      renameDelayMs: 1,
    });
    await gateway.update(addOrder("SL-1"));
    expect(calls).toBe(3);
    expect((await gateway.read()).orders).toHaveLength(1);
  });

  it("hết lần thử: ném lỗi gốc và xóa tmp", async () => {
    const fakeFs: StoreFs = {
      ...realFs,
      rename: async () => {
        throw Object.assign(new Error("locked"), { code: "EBUSY" });
      },
    };
    const gateway = createJsonFileStoreGateway(file, {
      fs: fakeFs,
      renameAttempts: 2,
      renameDelayMs: 1,
    });
    await expect(gateway.update(addOrder("SL-1"))).rejects.toThrow("locked");
    expect(await readdir(path.dirname(file))).toEqual([]);
  });

  it.each(["writeFile", "rename"] as const)(
    "%s ném giữa lần ghi: update ném lỗi gốc, store.json gốc nguyên vẹn, không còn tmp",
    async (failing) => {
      const good = createJsonFileStoreGateway(file);
      await good.update(addOrder("SL-1"));
      const before = await readFile(file, "utf8");

      const boom = Object.assign(new Error("disk full"), { code: "ENOSPC" });
      const fakeFs: StoreFs = {
        ...realFs,
        writeFile: async (...args) => {
          if (failing === "writeFile") {
            // ghi dở dang rồi ném, như đĩa đầy giữa chừng
            await realFs.writeFile(args[0], "{ partial", "utf8");
            throw boom;
          }
          return realFs.writeFile(...args);
        },
        rename: async (from, to) => {
          if (failing === "rename") throw boom;
          return realFs.rename(from, to);
        },
      };
      const gateway = createJsonFileStoreGateway(file, {
        fs: fakeFs,
        renameDelayMs: 1,
      });
      await expect(gateway.update(addOrder("SL-2"))).rejects.toBe(boom);

      expect(await readFile(file, "utf8")).toBe(before);
      expect(await readdir(path.dirname(file))).toEqual(["store.json"]);
      expect((await good.read()).orders.map((o) => o.id)).toEqual(["SL-1"]);
    },
  );

  it("lỗi rename khác EPERM/EBUSY không thử lại", async () => {
    let calls = 0;
    const fakeFs: StoreFs = {
      ...realFs,
      rename: async () => {
        calls++;
        throw Object.assign(new Error("nope"), { code: "EACCES" });
      },
    };
    const gateway = createJsonFileStoreGateway(file, {
      fs: fakeFs,
      renameDelayMs: 1,
    });
    await expect(gateway.update(addOrder("SL-1"))).rejects.toThrow("nope");
    expect(calls).toBe(1);
  });

  it.each([
    ["không phải object", 5],
    ["status lạ", { ...order("SL-1"), status: "weird" }],
    ["thiếu id", { ...order("SL-1"), id: undefined }],
  ])("store.json có đơn hỏng (%s): CORRUPT_STORE chỉ nêu chỉ số, file giữ nguyên", async (_n, bad) => {
    await mkdir(path.dirname(file), { recursive: true });
    const text = JSON.stringify({ ...createEmptyStore(), orders: [order("SL-0"), bad] });
    await writeFile(file, text);
    const gateway = createJsonFileStoreGateway(file);
    for (const run of [
      () => gateway.read(),
      () => gateway.update((d) => ({ data: d, result: 1 })),
    ]) {
      const error = await run().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(StoreError);
      expect((error as StoreError).code).toBe("CORRUPT_STORE");
      expect((error as StoreError).message).toContain("1");
      expect((error as StoreError).message).not.toContain("0901234567");
    }
    expect(await readFile(file, "utf8")).toBe(text);
  });

  describe("nhập đơn cũ (legacy)", () => {
    const legacyOrder = (id: string, status = "pending") => {
      const { source, statusHistory, internalNotes, ...rest } = order(id);
      void source;
      void statusHistory;
      void internalNotes;
      return { ...rest, status };
    };
    let legacy: string;
    let logs: string[];
    const make = () =>
      createJsonFileStoreGateway(file, {
        legacyFile: legacy,
        log: (name) => logs.push(name),
      });

    beforeEach(() => {
      legacy = path.join(dir, "orders.json");
      logs = [];
    });

    it("read trả đơn đã chuẩn hóa, chưa tạo file; update đầu tạo store.json và log một lần", async () => {
      const text = JSON.stringify([
        legacyOrder("SL-1"),
        legacyOrder("SL-2", "cancelled"),
      ]);
      await writeFile(legacy, text);
      const gateway = make();
      const read = await gateway.read();
      expect(read.orders.map((o) => o.source)).toEqual(["web", "web"]);
      expect(read.orders[1].statusHistory).toHaveLength(2);
      await expect(readFile(file, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(logs).toEqual([]);

      await gateway.update((data) => ({ data, result: null }));
      await gateway.update((data) => ({ data, result: null }));
      const onDisk = JSON.parse(await readFile(file, "utf8")) as StoreData;
      expect(onDisk.orders).toHaveLength(2);
      expect(onDisk.orders[0].internalNotes).toEqual([]);
      expect(logs).toEqual(["legacy_imported"]);
      expect(await readFile(legacy, "utf8")).toBe(text);
    });

    it("không có legacy: store rỗng, không log", async () => {
      const gateway = make();
      expect(await gateway.read()).toEqual(createEmptyStore());
      await gateway.update((data) => ({ data, result: null }));
      expect(logs).toEqual([]);
    });

    it.each([
      ["JSON sai", "{oops"],
      ["0 byte", ""],
      ["không phải mảng", "{}"],
    ])(
      "legacy hỏng (%s): CORRUPT_STORE, không tạo file",
      async (_n, content) => {
        await writeFile(legacy, content);
        const gateway = make();
        await expect(gateway.read()).rejects.toMatchObject({
          code: "CORRUPT_STORE",
        });
        await expect(
          gateway.update((d) => ({ data: d, result: 1 })),
        ).rejects.toMatchObject({
          code: "CORRUPT_STORE",
        });
        await expect(readFile(file, "utf8")).rejects.toMatchObject({
          code: "ENOENT",
        });
        expect(logs).toEqual([]);
      },
    );

    it("đã có store.json: không dùng legacy, không log", async () => {
      await writeFile(legacy, JSON.stringify([legacyOrder("SL-L")]));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(createEmptyStore()));
      const gateway = make();
      expect((await gateway.read()).orders).toEqual([]);
      await gateway.update((data) => ({ data, result: null }));
      expect(logs).toEqual([]);
    });

    it("store.json hỏng không rơi về legacy", async () => {
      await writeFile(legacy, JSON.stringify([legacyOrder("SL-L")]));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, "{oops");
      await expect(make().read()).rejects.toMatchObject({
        code: "CORRUPT_STORE",
      });
    });

    it.each([
      ["không phải object", 5],
      ["status lạ", { ...legacyOrder("SL-1"), status: "weird" }],
      ["thiếu id", { ...legacyOrder("SL-1"), id: undefined }],
      ["thời điểm sai", { ...legacyOrder("SL-1"), createdAt: "xx" }],
    ])(
      "đơn hỏng cấu trúc (%s): CORRUPT_STORE chỉ nêu chỉ số, không ghi file",
      async (_n, bad) => {
        await writeFile(legacy, JSON.stringify([legacyOrder("SL-0"), bad]));
        const gateway = make();
        const error = await gateway.read().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(StoreError);
        expect((error as StoreError).code).toBe("CORRUPT_STORE");
        expect((error as StoreError).message).toContain("1");
        expect((error as StoreError).message).not.toContain("0901234567");
        await expect(
          gateway.update((d) => ({ data: d, result: 1 })),
        ).rejects.toBeInstanceOf(StoreError);
        await expect(readFile(file, "utf8")).rejects.toMatchObject({
          code: "ENOENT",
        });
      },
    );
  });
});
