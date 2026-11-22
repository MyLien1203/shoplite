// @vitest-environment node
import { describe, expect, it } from "vitest";
import { issueOwnToken, mergeOwnedIds, OWN_PROOF_MAX_AGE_MS, readOwnedIds } from "./own-proof";
import { signToken, verifyToken } from "./signed-token";

const SECRET = "s".repeat(32);
const NOW = 1_000_000;

describe("mergeOwnedIds", () => {
  it("thêm id mới ở cuối", () => {
    expect(mergeOwnedIds(["A"], "B", 20)).toEqual(["A", "B"]);
  });
  it("bỏ trùng và dời id tra lại xuống cuối", () => {
    expect(mergeOwnedIds(["A", "B"], "A", 20)).toEqual(["B", "A"]);
  });
  it("đầy thì bỏ mục cũ nhất", () => {
    const full = Array.from({ length: 20 }, (_, i) => `O${i}`);
    const next = mergeOwnedIds(full, "NEW", 20);
    expect(next).toHaveLength(20);
    expect(next[0]).toBe("O1");
    expect(next[19]).toBe("NEW");
  });
  it("danh sách rỗng", () => {
    expect(mergeOwnedIds([], "A", 20)).toEqual(["A"]);
  });
});

describe("issueOwnToken", () => {
  function read(token: string): string[] {
    const result = verifyToken(token, SECRET, "own", NOW);
    if (!result.ok || result.payload.purpose !== "own") throw new Error("token không hợp lệ");
    return result.payload.orderIds;
  }

  it("không có token cũ: chỉ chứa đơn mới, hạn 30 ngày", () => {
    const token = issueOwnToken(undefined, "B", SECRET, NOW);
    expect(read(token)).toEqual(["B"]);
    const result = verifyToken(token, SECRET, "own", NOW + OWN_PROOF_MAX_AGE_MS - 1);
    expect(result.ok).toBe(true);
    expect(verifyToken(token, SECRET, "own", NOW + OWN_PROOF_MAX_AGE_MS).ok).toBe(false);
  });
  it("gộp với token cũ hợp lệ", () => {
    const old = signToken({ purpose: "own", exp: NOW + 1000, orderIds: ["A"] }, SECRET);
    expect(read(issueOwnToken(old, "B", SECRET, NOW))).toEqual(["A", "B"]);
  });
  it("trùng id thì không lặp", () => {
    const old = signToken({ purpose: "own", exp: NOW + 1000, orderIds: ["A", "B"] }, SECRET);
    expect(read(issueOwnToken(old, "A", SECRET, NOW))).toEqual(["B", "A"]);
  });
  it("đầy 20 thì bỏ cũ nhất", () => {
    const full = Array.from({ length: 20 }, (_, i) => `O${i}`);
    const old = signToken({ purpose: "own", exp: NOW + 1000, orderIds: full }, SECRET);
    const ids = read(issueOwnToken(old, "NEW", SECRET, NOW));
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe("O1");
    expect(ids[19]).toBe("NEW");
  });
  it("token cũ hỏng/hết hạn: chỉ còn đơn mới", () => {
    const expired = signToken({ purpose: "own", exp: NOW - 1, orderIds: ["A"] }, SECRET);
    expect(read(issueOwnToken(expired, "B", SECRET, NOW))).toEqual(["B"]);
    expect(read(issueOwnToken("rac", "B", SECRET, NOW))).toEqual(["B"]);
  });
});

describe("readOwnedIds", () => {
  it("đọc token own hợp lệ", () => {
    const token = signToken({ purpose: "own", exp: NOW + 1000, orderIds: ["A", "B"] }, SECRET);
    expect(readOwnedIds(token, SECRET, NOW)).toEqual(["A", "B"]);
  });
  it("[] khi không có token", () => {
    expect(readOwnedIds(undefined, SECRET, NOW)).toEqual([]);
  });
  it("[] khi sai chữ ký, hết hạn, sai purpose, rác", () => {
    const good = signToken({ purpose: "own", exp: NOW + 1000, orderIds: ["A"] }, SECRET);
    expect(readOwnedIds(good, "t".repeat(32), NOW)).toEqual([]);
    expect(readOwnedIds(good, SECRET, NOW + 1000)).toEqual([]);
    const staff = signToken({ purpose: "staff", exp: NOW + 1000 }, SECRET);
    expect(readOwnedIds(staff, SECRET, NOW)).toEqual([]);
    expect(readOwnedIds("rac", SECRET, NOW)).toEqual([]);
  });
});
