import { describe, expect, it } from "vitest";
import { OrderError } from "@/features/orders/order-errors";
import { applyStockDelta } from "./stock-rules";

const catalog = [
  { id: "p011", name: "Tên A", stock: 3 },
  { id: "p004", name: "Tên B", stock: 0 },
  { id: "p001", name: "Tên C", stock: 10 },
] as const;

function catchError(fn: () => unknown): OrderError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(OrderError);
    return e as OrderError;
  }
  throw new Error("Kỳ vọng hàm ném OrderError nhưng không ném");
}

describe("applyStockDelta", () => {
  it("trừ đủ từ tồn tĩnh khi inventory rỗng", () => {
    const r = applyStockDelta({}, catalog, [{ productId: "p011", delta: -2 }], "order");
    expect(r.inventory).toEqual({ p011: 1 });
    expect(r.changes).toEqual([{ productId: "p011", before: 3, after: 1 }]);
  });

  it("về đúng 0 là hợp lệ", () => {
    const r = applyStockDelta({ p011: 2 }, catalog, [{ productId: "p011", delta: -2 }], "order");
    expect(r.inventory).toEqual({ p011: 0 });
    expect(r.changes[0].after).toBe(0);
  });

  it("thiếu đúng 1 ném INSUFFICIENT_STOCK 409 'chỉ còn 3 sản phẩm'", () => {
    const e = catchError(() =>
      applyStockDelta({}, catalog, [{ productId: "p011", delta: -4 }], "order"),
    );
    expect(e.code).toBe("INSUFFICIENT_STOCK");
    expect(e.httpStatus).toBe(409);
    expect(e.message).toBe('Sản phẩm "Tên A" chỉ còn 3 sản phẩm');
  });

  it("hết hàng: 'đã hết hàng'", () => {
    const e = catchError(() =>
      applyStockDelta({}, catalog, [{ productId: "p004", delta: -1 }], "order"),
    );
    expect(e.code).toBe("INSUFFICIENT_STOCK");
    expect(e.message).toBe('Sản phẩm "Tên B" đã hết hàng');
  });

  it("lớp phủ 0 thắng tồn tĩnh 3", () => {
    const e = catchError(() =>
      applyStockDelta({ p011: 0 }, catalog, [{ productId: "p011", delta: -1 }], "order"),
    );
    expect(e.code).toBe("INSUFFICIENT_STOCK");
    expect(e.message).toBe('Sản phẩm "Tên A" đã hết hàng');
  });

  it("lớp phủ âm (store hỏng) vẫn báo 'đã hết hàng', không 'chỉ còn -n'", () => {
    const e = catchError(() =>
      applyStockDelta({ p011: -2 }, catalog, [{ productId: "p011", delta: -1 }], "order"),
    );
    expect(e.code).toBe("INSUFFICIENT_STOCK");
    expect(e.message).toBe('Sản phẩm "Tên A" đã hết hàng');
  });

  it("lớp phủ lớn hơn tồn tĩnh được dùng làm before", () => {
    const r = applyStockDelta({ p011: 8 }, catalog, [{ productId: "p011", delta: -5 }], "order");
    expect(r.changes).toEqual([{ productId: "p011", before: 8, after: 3 }]);
  });

  it("nhiều dòng, một dòng thiếu: ném lỗi của dòng thiếu, không có kết quả", () => {
    const inventory = Object.freeze({});
    const e = catchError(() =>
      applyStockDelta(
        inventory,
        catalog,
        [
          { productId: "p001", delta: -1 },
          { productId: "p011", delta: -4 },
        ],
        "order",
      ),
    );
    expect(e.code).toBe("INSUFFICIENT_STOCK");
    expect(e.message).toContain("Tên A");
    expect(inventory).toEqual({});
  });

  it("dòng lỗi đầu tiên (theo thứ tự xuất hiện) là lỗi được ném", () => {
    const e = catchError(() =>
      applyStockDelta(
        {},
        catalog,
        [
          { productId: "p004", delta: -1 },
          { productId: "p011", delta: -4 },
        ],
        "order",
      ),
    );
    expect(e.message).toBe('Sản phẩm "Tên B" đã hết hàng');
  });

  it("gộp dòng trùng rồi mới kiểm: -2 và -2 vượt tồn 3", () => {
    const e = catchError(() =>
      applyStockDelta(
        {},
        catalog,
        [
          { productId: "p011", delta: -2 },
          { productId: "p011", delta: -2 },
        ],
        "order",
      ),
    );
    expect(e.code).toBe("INSUFFICIENT_STOCK");
    expect(e.message).toBe('Sản phẩm "Tên A" chỉ còn 3 sản phẩm');
  });

  it("gộp dòng trùng hợp lệ thành một change", () => {
    const r = applyStockDelta(
      {},
      catalog,
      [
        { productId: "p011", delta: -1 },
        { productId: "p001", delta: -1 },
        { productId: "p011", delta: -1 },
      ],
      "order",
    );
    expect(r.inventory).toEqual({ p011: 1, p001: 9 });
    expect(r.changes).toEqual([
      { productId: "p011", before: 3, after: 1 },
      { productId: "p001", before: 10, after: 9 },
    ]);
  });

  it("cộng bù với kind order", () => {
    const r = applyStockDelta({ p011: 0 }, catalog, [{ productId: "p011", delta: 2 }], "order");
    expect(r.inventory).toEqual({ p011: 2 });
  });

  it("điều chỉnh âm ném VALIDATION_ERROR 400", () => {
    const e = catchError(() =>
      applyStockDelta({}, catalog, [{ productId: "p011", delta: -4 }], "adjustment"),
    );
    expect(e.code).toBe("VALIDATION_ERROR");
    expect(e.httpStatus).toBe(400);
    expect(e.message).toBe('Tồn kho của "Tên A" không thể âm.');
  });

  it("điều chỉnh hợp lệ cộng vào sản phẩm hết hàng", () => {
    const r = applyStockDelta({}, catalog, [{ productId: "p004", delta: 5 }], "adjustment");
    expect(r.inventory).toEqual({ p004: 5 });
    expect(r.changes).toEqual([{ productId: "p004", before: 0, after: 5 }]);
  });

  it.each(["order", "adjustment"] as const)("id lạ ném PRODUCT_NOT_FOUND 422 (%s)", (kind) => {
    const e = catchError(() =>
      applyStockDelta({}, catalog, [{ productId: "pXXX", delta: -1 }], kind),
    );
    expect(e.code).toBe("PRODUCT_NOT_FOUND");
    expect(e.httpStatus).toBe(422);
    expect(e.message).toBe('Không tìm thấy sản phẩm "pXXX"');
  });

  it("id lạ vẫn bị kiểm khi delta bằng 0", () => {
    const e = catchError(() =>
      applyStockDelta({}, catalog, [{ productId: "pXXX", delta: 0 }], "order"),
    );
    expect(e.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("deltas rỗng trả bản sao và changes rỗng", () => {
    const inventory = { p011: 2 };
    const r = applyStockDelta(inventory, catalog, [], "order");
    expect(r.inventory).toEqual(inventory);
    expect(r.inventory).not.toBe(inventory);
    expect(r.changes).toEqual([]);
  });

  it("delta 0 không thêm khóa và không có change", () => {
    const r = applyStockDelta({}, catalog, [{ productId: "p011", delta: 0 }], "order");
    expect(r.inventory).toEqual({});
    expect(Object.keys(r.inventory)).toHaveLength(0);
    expect(r.changes).toEqual([]);
  });

  it("delta gộp bằng 0 không thêm khóa", () => {
    const r = applyStockDelta(
      {},
      catalog,
      [
        { productId: "p011", delta: -1 },
        { productId: "p011", delta: 1 },
      ],
      "order",
    );
    expect(r.inventory).toEqual({});
    expect(r.changes).toEqual([]);
  });

  it("giữ nguyên các khóa không liên quan", () => {
    const r = applyStockDelta(
      { p001: 7, p004: 2 },
      catalog,
      [{ productId: "p011", delta: -1 }],
      "order",
    );
    expect(r.inventory).toEqual({ p001: 7, p004: 2, p011: 2 });
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "delta %s ném VALIDATION_ERROR 400 cho cả hai kind",
    (delta) => {
      for (const kind of ["order", "adjustment"] as const) {
        const e = catchError(() =>
          applyStockDelta({}, catalog, [{ productId: "p011", delta }], kind),
        );
        expect(e.code).toBe("VALIDATION_ERROR");
        expect(e.httpStatus).toBe(400);
        expect(e.message).toBe("Số lượng thay đổi tồn kho không hợp lệ.");
      }
    },
  );

  it("delta sai kiểu được kiểm trước tồn", () => {
    const e = catchError(() =>
      applyStockDelta(
        {},
        catalog,
        [
          { productId: "p004", delta: -1 },
          { productId: "p011", delta: 1.5 },
        ],
        "order",
      ),
    );
    expect(e.code).toBe("VALIDATION_ERROR");
  });

  it("không đổi đầu vào (đóng băng) và trả đối tượng mới", () => {
    const inventory = Object.freeze({ p011: 2 });
    const deltas = Object.freeze([
      Object.freeze({ productId: "p011", delta: -1 }),
      Object.freeze({ productId: "p001", delta: -2 }),
    ]);
    const r = applyStockDelta(inventory, catalog, deltas, "order");
    expect(r.inventory).not.toBe(inventory);
    expect(r.inventory).toEqual({ p011: 1, p001: 8 });
    expect(inventory).toEqual({ p011: 2 });
    expect(deltas).toEqual([
      { productId: "p011", delta: -1 },
      { productId: "p001", delta: -2 },
    ]);
  });

  it("lỗi cũng không đổi inventory đầu vào", () => {
    const inventory = Object.freeze({ p001: 5 });
    catchError(() =>
      applyStockDelta(
        inventory,
        catalog,
        [
          { productId: "p001", delta: -1 },
          { productId: "p011", delta: -9 },
        ],
        "order",
      ),
    );
    expect(inventory).toEqual({ p001: 5 });
  });
});
