// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OrderError } from "@/features/orders/order-errors";
import { parseWriteRequest } from "./write-request";

function req(headers: Record<string, string>, body = '{"a":1}'): Request {
  return new Request("http://shop.test/api/x", {
    method: "POST",
    headers,
    body,
  });
}

const JSON_CT = { "Content-Type": "application/json" };

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  return undefined;
}

function expectValidation(error: unknown): void {
  expect(error).toBeInstanceOf(OrderError);
  expect((error as OrderError).code).toBe("VALIDATION_ERROR");
}

describe("parseWriteRequest", () => {
  it("trả body đã parse khi hợp lệ, Origin vắng mặt", async () => {
    const body = await parseWriteRequest(req(JSON_CT), { trustedProxyHops: 0 });
    expect(body).toEqual({ a: 1 });
  });

  it("chấp nhận Content-Type có charset", async () => {
    const body = await parseWriteRequest(
      req({ "Content-Type": "application/json; charset=utf-8" }),
      { trustedProxyHops: 0 },
    );
    expect(body).toEqual({ a: 1 });
  });

  it("thiếu Content-Type thì VALIDATION_ERROR", async () => {
    const error = await failure(
      parseWriteRequest(
        new Request("http://shop.test/api/x", { method: "POST" }),
        { trustedProxyHops: 0 },
      ),
    );
    expectValidation(error);
  });

  it("Content-Type khác JSON thì VALIDATION_ERROR", async () => {
    const error = await failure(
      parseWriteRequest(req({ "Content-Type": "text/plain" }), {
        trustedProxyHops: 0,
      }),
    );
    expectValidation(error);
  });

  it("JSON hỏng trả undefined", async () => {
    const body = await parseWriteRequest(req(JSON_CT, "{oops"), {
      trustedProxyHops: 0,
    });
    expect(body).toBeUndefined();
  });

  it("Origin cùng Host thì qua (không phân biệt hoa thường)", async () => {
    const body = await parseWriteRequest(
      req({ ...JSON_CT, Host: "Shop.Test", Origin: "http://shop.test" }),
      { trustedProxyHops: 0 },
    );
    expect(body).toEqual({ a: 1 });
  });

  it("Origin lệch Host thì VALIDATION_ERROR", async () => {
    const error = await failure(
      parseWriteRequest(
        req({ ...JSON_CT, Host: "shop.test", Origin: "http://evil.test" }),
        { trustedProxyHops: 0 },
      ),
    );
    expectValidation(error);
  });

  it("Origin: null thì VALIDATION_ERROR", async () => {
    const error = await failure(
      parseWriteRequest(
        req({ ...JSON_CT, Host: "shop.test", Origin: "null" }),
        { trustedProxyHops: 0 },
      ),
    );
    expectValidation(error);
  });

  it("Origin có mặt mà không có Host thì VALIDATION_ERROR", async () => {
    const error = await failure(
      parseWriteRequest(req({ ...JSON_CT, Origin: "http://shop.test" }), {
        trustedProxyHops: 0,
      }),
    );
    expectValidation(error);
  });

  it("X-Forwarded-Host bị bỏ qua khi hops = 0", async () => {
    const error = await failure(
      parseWriteRequest(
        req({
          ...JSON_CT,
          Host: "internal:3000",
          "X-Forwarded-Host": "shop.test",
          Origin: "https://shop.test",
        }),
        { trustedProxyHops: 0 },
      ),
    );
    expectValidation(error);
  });

  it("X-Forwarded-Host được tin khi hops > 0", async () => {
    const body = await parseWriteRequest(
      req({
        ...JSON_CT,
        Host: "internal:3000",
        "X-Forwarded-Host": "shop.test",
        Origin: "https://shop.test",
      }),
      { trustedProxyHops: 1 },
    );
    expect(body).toEqual({ a: 1 });
  });
});
