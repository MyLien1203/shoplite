// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getClientKey } from "./client-ip";

describe("getClientKey", () => {
  it("hops = 0 thì luôn direct", () => {
    expect(getClientKey("1.1.1.1, 2.2.2.2", 0)).toBe("direct");
  });
  it("hops = 1 lấy phần tử cuối, đã trim", () => {
    expect(getClientKey("9.9.9.9,  2.2.2.2 ", 1)).toBe("2.2.2.2");
  });
  it("hops = 2 lấy phần tử thứ hai từ phải", () => {
    expect(getClientKey("9.9.9.9, 1.1.1.1, 2.2.2.2", 2)).toBe("1.1.1.1");
  });
  it("thêm phần tử giả vào đầu không đổi khóa", () => {
    expect(getClientKey("6.6.6.6, 1.1.1.1, 2.2.2.2", 2)).toBe(getClientKey("1.1.1.1, 2.2.2.2", 2));
  });
  it("header thiếu, rỗng, ít phần tử hoặc phần tử rỗng thì direct", () => {
    expect(getClientKey(null, 1)).toBe("direct");
    expect(getClientKey(undefined, 1)).toBe("direct");
    expect(getClientKey("", 1)).toBe("direct");
    expect(getClientKey("1.1.1.1", 2)).toBe("direct");
    expect(getClientKey("1.1.1.1, ", 1)).toBe("direct");
  });
  it("hops âm, NaN hoặc phân số thì direct", () => {
    expect(getClientKey("1.1.1.1, 2.2.2.2", -1)).toBe("direct");
    expect(getClientKey("1.1.1.1, 2.2.2.2", Number.NaN)).toBe("direct");
    expect(getClientKey("1.1.1.1, 2.2.2.2", 1.5)).toBe("direct");
  });
  it("cắt tối đa 64 ký tự", () => {
    expect(getClientKey("x".repeat(200), 1)).toHaveLength(64);
  });
});
