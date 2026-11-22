import { describe, expect, it } from "vitest";
import { hasLookupKeys, parseLookupFragment } from "./parse-lookup-fragment";

describe("parseLookupFragment", () => {
  it("liên kết đúng", () => {
    expect(parseLookupFragment("#code=SL-20261021-4F9A2C&phone=0912345678")).toEqual({
      orderId: "SL-20261021-4F9A2C",
      phone: "0912345678",
    });
  });

  it("%2B84 giải mã thành +84", () => {
    expect(parseLookupFragment("#code=SL-1&phone=%2B84912345678")?.phone).toBe("+84912345678");
  });

  it("+ trần giữ nguyên, không thành khoảng trắng", () => {
    expect(parseLookupFragment("#code=SL-1&phone=+84912345678")?.phone).toBe("+84912345678");
  });

  it("trim Mã đơn", () => {
    expect(parseLookupFragment("#code=%20sl-2026%20&phone=0912345678")?.orderId).toBe("sl-2026");
  });

  it("khóa lặp lấy lần đầu", () => {
    expect(parseLookupFragment("#code=A&code=B&phone=0912345678&phone=abc")).toEqual({
      orderId: "A",
      phone: "0912345678",
    });
  });

  it("không có # đầu vẫn phân tích được", () => {
    expect(parseLookupFragment("code=A&phone=0912345678")).toEqual({
      orderId: "A",
      phone: "0912345678",
    });
  });

  it("cặp lạ có mã hóa hỏng bị bỏ qua", () => {
    expect(parseLookupFragment("#utm=%E0%A4%A&code=SL-1&phone=0912345678")).toEqual({
      orderId: "SL-1",
      phone: "0912345678",
    });
  });

  it.each([
    "",
    "#",
    "#abc",
    "#code=SL-1",
    "#phone=0912345678",
    "#code=&phone=",
    "#code=%20&phone=0912345678",
    "#code=SL-1&phone=abc",
    "#code=SL-1&phone=",
    "#code=SL-1&phone=%E0%A4%A",
    "#code=%E0%A4%A&phone=0912345678",
  ])("trả null cho %j", (hash) => {
    expect(parseLookupFragment(hash)).toBeNull();
  });
});

describe("hasLookupKeys", () => {
  it.each(["#code=1", "#phone=1", "#code=&phone=", "#x=1&phone=%E0%A4%A", "#code"])(
    "true cho %j",
    (hash) => {
      expect(hasLookupKeys(hash)).toBe(true);
    },
  );

  it.each(["", "#", "#abc", "#section=1", "#codes=1"])("false cho %j", (hash) => {
    expect(hasLookupKeys(hash)).toBe(false);
  });
});
