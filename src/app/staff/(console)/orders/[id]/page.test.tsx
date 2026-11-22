import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireStaffPage } from "@/features/access/require-staff";
import StaffOrderDetailPage, { dynamic, metadata } from "./page";

vi.mock("@/features/access/require-staff", () => ({ requireStaffPage: vi.fn() }));
vi.mock("@/features/staff/components/staff-order-detail-view", () => ({
  StaffOrderDetailView: ({ orderId }: { orderId: string }) => (
    <div data-testid="detail-view" data-order-id={orderId} />
  ),
}));

const props = (id: string) =>
  ({ params: Promise.resolve({ id }) }) as unknown as Parameters<typeof StaffOrderDetailPage>[0];

describe("/staff/orders/[id]", () => {
  beforeEach(() => {
    vi.mocked(requireStaffPage).mockReset();
  });

  it("gọi guard rồi truyền orderId cho khối client", async () => {
    render(await StaffOrderDetailPage(props("SL-1")));
    expect(requireStaffPage).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("detail-view")).toHaveAttribute("data-order-id", "SL-1");
  });

  it("không render khi guard ném (chuyển hướng)", async () => {
    vi.mocked(requireStaffPage).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(StaffOrderDetailPage(props("SL-1"))).rejects.toThrow("NEXT_REDIRECT");
  });

  it("có metadata noindex và force-dynamic", () => {
    expect(metadata.title).toBe("Chi tiết đơn");
    expect(metadata.robots).toEqual({ index: false });
    expect(dynamic).toBe("force-dynamic");
  });
});
