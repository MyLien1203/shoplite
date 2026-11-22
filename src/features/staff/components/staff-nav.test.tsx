import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffNav } from "./staff-nav";

const replace = vi.fn();
const refresh = vi.fn();
let pathname = "/staff";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  usePathname: () => pathname,
}));

describe("<StaffNav />", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    replace.mockReset();
    refresh.mockReset();
    pathname = "/staff";
  });

  it("chỉ có một liên kết Đơn hàng, đang chọn ở /staff", () => {
    render(<StaffNav />);
    const link = screen.getByRole("link", { name: "Đơn hàng" });
    expect(link).toHaveAttribute("href", "/staff");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass("bg-indigo-50", "text-indigo-700", "min-h-10");
    expect(screen.getAllByRole("link")).toHaveLength(2); // logo + Đơn hàng
  });

  it("không chọn liên kết khi ở đường dẫn khác", () => {
    pathname = "/staff/khac";
    render(<StaffNav />);
    const link = screen.getByRole("link", { name: "Đơn hàng" });
    expect(link).not.toHaveAttribute("aria-current");
    expect(link).toHaveClass("text-slate-600");
  });

  it("có logo, nhãn Nhân viên, không giỏ hàng và không Sản phẩm", () => {
    render(<StaffNav />);
    expect(screen.getByRole("link", { name: "ShopLite - Trang chủ" })).toHaveAttribute("href", "/");
    expect(screen.getByTestId("staff-badge")).toHaveTextContent("Nhân viên");
    expect(screen.getByTestId("staff-badge")).toHaveClass("bg-slate-900", "text-white");
    expect(screen.queryByRole("link", { name: /Sản phẩm/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/giỏ hàng/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("staff-nav")).toHaveClass("bg-white/90");
  });

  it("nút Đăng xuất có tên truy cập và chữ chỉ hiện từ sm", () => {
    render(<StaffNav />);
    const button = screen.getByRole("button", { name: "Đăng xuất" });
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(button.querySelector("span")).toHaveClass("hidden", "sm:inline");
  });

  it.each([
    ["200", () => new Response(JSON.stringify({ ok: true }), { status: 200 })],
    ["401", () => new Response("{}", { status: 401 })],
    ["5xx", () => new Response("", { status: 503 })],
  ])("đăng xuất với phản hồi %s vẫn chuyển tới /staff/login", async (_name, make) => {
    const fetchMock = vi.fn().mockResolvedValue(make());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StaffNav />);

    await user.click(screen.getByRole("button", { name: "Đăng xuất" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/staff/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(replace).toHaveBeenCalledWith("/staff/login");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("đăng xuất khi fetch ném lỗi vẫn chuyển trang, không hiện lỗi", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    const user = userEvent.setup();
    render(<StaffNav />);

    await user.click(screen.getByRole("button", { name: "Đăng xuất" }));

    expect(replace).toHaveBeenCalledWith("/staff/login");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("vô hiệu nút khi đang gửi và không gửi lần hai", async () => {
    let resolve: (value: Response) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StaffNav />);

    const button = screen.getByRole("button", { name: "Đăng xuất" });
    await user.click(button);
    expect(button).toBeDisabled();
    await user.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolve(new Response("{}", { status: 200 }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/staff/login"));
  });
});
