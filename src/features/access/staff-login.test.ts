// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isStaffPasswordValid, STAFF_SESSION_MAX_AGE_MS } from "./staff-login";

describe("isStaffPasswordValid", () => {
  it("đúng mật khẩu", () => {
    expect(isStaffPasswordValid("matkhau-dung", "matkhau-dung")).toBe(true);
  });
  it("sai mật khẩu", () => {
    expect(isStaffPasswordValid("matkhau-sai", "matkhau-dung")).toBe(false);
  });
  it("khác độ dài không ném", () => {
    expect(isStaffPasswordValid("a", "matkhau-rat-dai-dung")).toBe(false);
    expect(isStaffPasswordValid("matkhau-rat-dai-dung", "a")).toBe(false);
  });
  it("chuỗi rỗng", () => {
    expect(isStaffPasswordValid("", "matkhau-dung")).toBe(false);
  });
});

describe("STAFF_SESSION_MAX_AGE_MS", () => {
  it("đúng 12 giờ", () => {
    expect(STAFF_SESSION_MAX_AGE_MS).toBe(43_200_000);
  });
});
