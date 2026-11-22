import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffLoginForm } from "./staff-login-form";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
}));

function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: { code: "X", message } }), {
    status,
  });
}

describe("<StaffLoginForm />", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    replace.mockReset();
    refresh.mockReset();
  });

  it("có ô mật khẩu đúng thuộc tính và nút Đăng nhập", () => {
    render(<StaffLoginForm />);
    const input = screen.getByLabelText("Mật khẩu");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
    expect(screen.queryByText(/Phiên đã hết hạn/)).toBeNull();
  });

  it("hiện dòng hết hạn khi expired", () => {
    render(<StaffLoginForm expired />);
    expect(screen.getByText("Phiên đã hết hạn, vui lòng đăng nhập lại.")).toBeVisible();
  });

  it("ô trống: báo lỗi dưới ô và không gọi API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StaffLoginForm />);

    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    const input = screen.getByLabelText("Mật khẩu");
    expect(screen.getByText("Vui lòng nhập mật khẩu.")).toHaveAttribute("id", "password-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "password-error");
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(input, "a");
    expect(screen.queryByText("Vui lòng nhập mật khẩu.")).toBeNull();
  });

  it("đăng nhập đúng: gửi đúng thân, replace /staff rồi refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StaffLoginForm />);

    await user.type(screen.getByLabelText("Mật khẩu"), "bi-mat-123");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/staff/login");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ password: "bi-mat-123" });
    expect(replace).toHaveBeenCalledWith("/staff");
    expect(replace.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0]);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(window.location.href).not.toContain("bi-mat-123");
    expect(screen.getByLabelText("Mật khẩu").getAttribute("value") ?? "").not.toContain(
      "bi-mat-123",
    );
    expect(window.localStorage.length).toBe(0);
  });

  it("401: báo dưới ô, giữ giá trị, nút dùng lại được", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(401, "Mật khẩu không đúng.")));
    const user = userEvent.setup();
    render(<StaffLoginForm />);

    await user.type(screen.getByLabelText("Mật khẩu"), "sai");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByText("Mật khẩu không đúng.")).toHaveAttribute("id", "password-error");
    expect(screen.getByLabelText("Mật khẩu")).toHaveValue("sai");
    expect(screen.getByLabelText("Mật khẩu").getAttribute("value") ?? "").not.toContain("sai");
    expect(screen.getByLabelText("Mật khẩu")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    [429, "Bạn đã thử sai quá nhiều lần. Vui lòng thử lại sau 15 phút."],
    [500, "Đã có lỗi xảy ra, vui lòng thử lại sau"],
  ])("%i: hiện lời của API trong role=alert", async (status, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(status, message)));
    const user = userEvent.setup();
    render(<StaffLoginForm />);

    await user.type(screen.getByLabelText("Mật khẩu"), "x");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
  });

  it("429: lời trong role=alert, nút bật lại, giữ giá trị đã nhập", async () => {
    const message = "Bạn đã thử sai quá nhiều lần. Vui lòng thử lại sau 15 phút.";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(429, message)));
    const user = userEvent.setup();
    render(<StaffLoginForm />);

    await user.type(screen.getByLabelText("Mật khẩu"), "bi-mat");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
    expect(screen.getByLabelText("Mật khẩu")).toHaveValue("bi-mat");
    expect(replace).not.toHaveBeenCalled();
  });

  it("5xx không có thân JSON: dùng lời lỗi mạng", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 502 })));
    const user = userEvent.setup();
    render(<StaffLoginForm />);

    await user.type(screen.getByLabelText("Mật khẩu"), "x");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không kết nối được máy chủ, vui lòng thử lại.",
    );
  });

  it("lỗi mạng: báo trong role=alert, nút dùng lại được", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fail")));
    const user = userEvent.setup();
    render(<StaffLoginForm />);

    await user.type(screen.getByLabelText("Mật khẩu"), "x");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không kết nối được máy chủ, vui lòng thử lại.",
    );
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
  });

  it("đang gửi: nút vô hiệu và đổi chữ, xong thì dùng lại được", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((r) => (resolve = r))));
    const user = userEvent.setup();
    render(<StaffLoginForm />);

    await user.type(screen.getByLabelText("Mật khẩu"), "x");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(screen.getByRole("button", { name: "Đang đăng nhập…" })).toBeDisabled();

    resolve(errorResponse(401, "Mật khẩu không đúng."));
    expect(await screen.findByRole("button", { name: "Đăng nhập" })).toBeEnabled();
  });
});
