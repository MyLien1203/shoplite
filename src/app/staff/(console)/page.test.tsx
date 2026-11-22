import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireStaffPage } from "@/features/access/require-staff";
import StaffOrdersPage, { dynamic, metadata } from "./page";

vi.mock("@/features/access/require-staff", () => ({ requireStaffPage: vi.fn() }));
vi.mock("@/features/staff/components/staff-orders-view", () => ({
  StaffOrdersView: () => <div data-testid="staff-orders-view" />,
}));

describe("/staff (Đơn cần xử lý)", () => {
  beforeEach(() => {
    vi.mocked(requireStaffPage).mockReset();
  });

  it("gọi guard rồi hiển thị tiêu đề và khối danh sách đơn", async () => {
    render(await StaffOrdersPage());
    expect(requireStaffPage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { level: 1, name: "Đơn cần xử lý" })).toBeVisible();
    expect(screen.getByTestId("staff-orders-view")).toBeVisible();
    expect(screen.queryByText("Danh sách đơn sẽ hiển thị tại đây.")).toBeNull();
  });

  it("không render khi guard ném (chuyển hướng)", async () => {
    vi.mocked(requireStaffPage).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(StaffOrdersPage()).rejects.toThrow("NEXT_REDIRECT");
  });

  it("có metadata noindex và force-dynamic", () => {
    expect(metadata.title).toBe("Đơn cần xử lý");
    expect(metadata.robots).toEqual({ index: false });
    expect(dynamic).toBe("force-dynamic");
  });
});
