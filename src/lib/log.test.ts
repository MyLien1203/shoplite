import { describe, expect, it, vi } from "vitest";
import { logEvent } from "./log";

function capture(name: string, fields: Parameters<typeof logEvent>[1]) {
  const write = vi.fn();
  logEvent(name, fields, write);
  expect(write).toHaveBeenCalledTimes(1);
  return JSON.parse(write.mock.calls[0][0] as string) as Record<
    string,
    unknown
  >;
}

describe("logEvent", () => {
  it("ghi đúng các trường hợp lệ", () => {
    expect(
      capture("confirm_rejected_stock", { productId: "p1", code: 409 }),
    ).toEqual({ event: "confirm_rejected_stock", productId: "p1", code: 409 });
  });

  it("bỏ khóa PII dù là chuỗi hay số", () => {
    const out = capture("x", {
      orderId: "o1",
      phone: "0901234567",
      fullName: "A",
      address: "B",
      password: "pw",
      ip: "1.2.3.4",
      ipNum: 5,
      phoneNum: 901234567,
    });
    expect(out).toEqual({ event: "x", orderId: "o1" });
  });

  it("bỏ giá trị lạ, không ném", () => {
    const out = capture("x", {
      productId: {},
      orderId: Number.NaN,
      code: undefined,
      bucket: Infinity,
    });
    expect(out).toEqual({ event: "x" });
  });

  it("khóa event trong fields không ghi đè event của đầu ra", () => {
    expect(capture("real", { event: "fake", code: 1 })).toEqual({
      event: "real",
      code: 1,
    });
  });

  it("bỏ khóa kế thừa và khóa __proto__", () => {
    const inherited = Object.create({ orderId: "o1" }) as Record<
      string,
      unknown
    >;
    expect(capture("x", inherited)).toEqual({ event: "x" });
    const withProto = JSON.parse(
      '{"__proto__":{"orderId":"o1"},"bucket":"b"}',
    ) as Record<string, unknown>;
    expect(capture("x", withProto)).toEqual({ event: "x", bucket: "b" });
  });

  it("writer mặc định dùng console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => logEvent("x", { bucket: "b" })).not.toThrow();
    expect(spy).toHaveBeenCalledWith('{"event":"x","bucket":"b"}');
    spy.mockRestore();
  });
});
