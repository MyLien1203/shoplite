import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAccessConfig } from "@/features/access/server";
import StaffLoginPage from "./page";

vi.mock("@/features/access/server", () => ({ getAccessConfig: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

const configured = { configured: true } as ReturnType<typeof getAccessConfig>;
const unconfigured = { configured: false } as ReturnType<typeof getAccessConfig>;

async function renderPage(params: Record<string, string | string[] | undefined> = {}) {
  render(await StaffLoginPage({ searchParams: Promise.resolve(params) }));
}

describe("/staff/login", () => {
  beforeEach(() => {
    vi.mocked(getAccessConfig).mockReset();
  });

  it("đã cấu hình: có ô Mật khẩu và nút Đăng nhập, không có dòng hết hạn", async () => {
    vi.mocked(getAccessConfig).mockReturnValue(configured);
    await renderPage();
    expect(screen.getByLabelText("Mật khẩu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(screen.queryByText(/Phiên đã hết hạn/)).toBeNull();
  });

  it("chưa cấu hình: chỉ hiện thông báo, không ô nhập, không nút, không dòng hết hạn", async () => {
    vi.mocked(getAccessConfig).mockReturnValue(unconfigured);
    await renderPage({ expired: "1" });
    expect(screen.getByText("Khu vực nhân viên chưa được cấu hình.")).toBeVisible();
    expect(screen.queryByLabelText("Mật khẩu")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/Phiên đã hết hạn/)).toBeNull();
  });

  it("expired=1: hiện dòng hết hạn cùng form", async () => {
    vi.mocked(getAccessConfig).mockReturnValue(configured);
    await renderPage({ expired: "1" });
    expect(screen.getByText("Phiên đã hết hạn, vui lòng đăng nhập lại.")).toBeVisible();
    expect(screen.getByLabelText("Mật khẩu")).toBeInTheDocument();
  });

  it.each([["0"], ["true"], [["1", "1"]], [undefined]])(
    "expired=%j: không hiện dòng hết hạn",
    async (value) => {
      vi.mocked(getAccessConfig).mockReturnValue(configured);
      await renderPage({ expired: value });
      expect(screen.queryByText(/Phiên đã hết hạn/)).toBeNull();
    },
  );
});
