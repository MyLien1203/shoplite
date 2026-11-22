import { describe, expect, it } from "vitest";
import { OrderError } from "@/features/orders/order-errors";
import { handleRouteError } from "./http";

describe("handleRouteError", () => {
  it.each([
    ["UNAUTHORIZED", 401],
    ["RATE_LIMITED", 429],
  ] as const)("trả %s với status %i và body chuẩn", async (code, status) => {
    const response = handleRouteError(new OrderError(code, "Thông báo"));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      error: { code, message: "Thông báo" },
    });
  });
});
