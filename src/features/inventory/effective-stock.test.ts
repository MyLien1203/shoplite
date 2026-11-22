import { describe, expect, it } from "vitest";
import { effectiveStock } from "./effective-stock";

describe("effectiveStock", () => {
  const product = { id: "p011", stock: 3 };

  it("dùng khóa trong lớp phủ khi có", () => {
    expect(effectiveStock({ p011: 7 }, product)).toBe(7);
  });

  it("khóa bằng 0 vẫn thắng tồn tĩnh", () => {
    expect(effectiveStock({ p011: 0 }, product)).toBe(0);
  });

  it("thiếu khóa thì dùng product.stock", () => {
    expect(effectiveStock({}, product)).toBe(3);
    expect(effectiveStock({ p001: 9 }, product)).toBe(3);
  });
});
