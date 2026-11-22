import { describe, expect, it } from "vitest";
import { normalizePhone } from "./normalize-phone";

describe("normalizePhone", () => {
  it.each([
    "+84912345678",
    "0912345678",
    "0912 345 678",
    "091-234-5678",
    "(091) 234.5678",
    " +84 912 345 678 ",
  ])("chuẩn hóa %j về 0912345678", (input) => {
    expect(normalizePhone(input)).toBe("0912345678");
  });

  it.each(["", "   ", "12345", "+8412", "abc", "0212345678", "84912345678"])(
    "trả null cho %j",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});
