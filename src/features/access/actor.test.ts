// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type Actor, canAccessOrder, resolveActor } from "./actor";
import { signToken } from "./signed-token";

const SECRET = "s".repeat(32);
const NOW = 1_000_000;
const staffToken = signToken({ purpose: "staff", exp: NOW + 1000 }, SECRET);
const ownToken = signToken(
  { purpose: "own", exp: NOW + 1000, orderIds: ["A", "B"] },
  SECRET,
);

describe("resolveActor", () => {
  it("có cả hai cookie thì staff thắng", () => {
    expect(
      resolveActor({ sl_staff: staffToken, sl_own: ownToken }, SECRET, NOW),
    ).toEqual({
      kind: "staff",
    });
  });

  it("chỉ sl_own thì customer", () => {
    expect(resolveActor({ sl_own: ownToken }, SECRET, NOW)).toEqual({
      kind: "customer",
      ownedIds: ["A", "B"],
    });
  });

  it("chỉ sl_staff thì staff", () => {
    expect(resolveActor({ sl_staff: staffToken }, SECRET, NOW)).toEqual({
      kind: "staff",
    });
  });

  it("không cookie thì anonymous", () => {
    expect(resolveActor({}, SECRET, NOW)).toEqual({ kind: "anonymous" });
  });

  it("token sai coi như không có", () => {
    expect(
      resolveActor({ sl_staff: "rác", sl_own: ownToken }, SECRET, NOW),
    ).toEqual({
      kind: "customer",
      ownedIds: ["A", "B"],
    });
    expect(
      resolveActor({ sl_staff: "rác", sl_own: "rác" }, SECRET, NOW),
    ).toEqual({
      kind: "anonymous",
    });
  });

  it("sl_staff hết hạn kèm sl_own hợp lệ thì customer", () => {
    const expired = signToken({ purpose: "staff", exp: NOW - 1 }, SECRET);
    expect(
      resolveActor({ sl_staff: expired, sl_own: ownToken }, SECRET, NOW),
    ).toEqual({ kind: "customer", ownedIds: ["A", "B"] });
  });

  it("cookie nhầm purpose bị từ chối", () => {
    expect(resolveActor({ sl_staff: ownToken }, SECRET, NOW)).toEqual({
      kind: "anonymous",
    });
    expect(resolveActor({ sl_own: staffToken }, SECRET, NOW)).toEqual({
      kind: "anonymous",
    });
  });
});

describe("canAccessOrder", () => {
  const staff: Actor = { kind: "staff" };
  const customer: Actor = { kind: "customer", ownedIds: ["A"] };
  const anonymous: Actor = { kind: "anonymous" };

  it("staff truy cập mọi đơn", () =>
    expect(canAccessOrder(staff, "Z")).toBe(true));
  it("customer chỉ đơn của mình", () => {
    expect(canAccessOrder(customer, "A")).toBe(true);
    expect(canAccessOrder(customer, "Z")).toBe(false);
  });
  it("anonymous không truy cập được", () =>
    expect(canAccessOrder(anonymous, "A")).toBe(false));
});
