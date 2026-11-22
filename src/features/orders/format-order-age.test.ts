import { describe, expect, it } from "vitest";
import { formatOrderAge } from "./format-order-age";

const NOW = Date.parse("2026-11-22T12:00:00.000Z");
const MIN = 60_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("formatOrderAge", () => {
  it.each([
    ["59 phút", 59 * MIN, "59 phút"],
    ["60 phút", 60 * MIN, "1 giờ"],
    ["23 giờ 59 phút", 23 * 60 * MIN + 59 * MIN, "23 giờ"],
    ["đúng 24 giờ", 24 * 60 * MIN, "1 ngày"],
    ["3 ngày", 3 * 24 * 60 * MIN, "3 ngày"],
    ["đúng 60 giây", 60_000, "1 phút"],
    ["59 giây", 59_000, "vừa xong"],
    ["0 giây", 0, "vừa xong"],
    ["tương lai", -5 * MIN, "vừa xong"],
    ["90 phút làm tròn xuống", 90 * MIN, "1 giờ"],
  ])("%s", (_name, diff, expected) => {
    expect(formatOrderAge(ago(diff), NOW)).toBe(expected);
  });

  it("chuỗi hỏng hoặc rỗng là Không rõ, không ném lỗi", () => {
    expect(formatOrderAge("hỏng", NOW)).toBe("Không rõ");
    expect(formatOrderAge("", NOW)).toBe("Không rõ");
  });

  it("nhận now là Date", () => {
    expect(formatOrderAge(ago(5 * MIN), new Date(NOW))).toBe("5 phút");
  });
});
