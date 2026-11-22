import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ShippingPanel, type ShippingPanelProps } from "./shipping-panel";

const CREATED = "2026-11-20T18:30:00.000Z";

function makeProps(over: Partial<ShippingPanelProps> = {}): ShippingPanelProps {
  return {
    orderId: "SL-1",
    createdAt: CREATED,
    pending: false,
    serverErrors: null,
    generalError: null,
    onSubmit: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

function setup(over: Partial<ShippingPanelProps> = {}) {
  const props = makeProps(over);
  const view = render(<ShippingPanel {...props} />);
  return { props, ...view };
}
const code = () => screen.getByLabelText("Mã vận đơn");
const date = () => screen.getByLabelText("Ngày giao dự kiến");
const submit = () => screen.getByRole("button", { name: /Bắt đầu giao|Đang chuyển/ });
const ZWSP = String.fromCharCode(0x200b);

describe("<ShippingPanel />", () => {
  it("mount: tiêu điểm ô mã, ô ngày min theo ngày VN, không dấu *, noValidate, không maxLength/required", () => {
    const { container } = setup();
    expect(code()).toHaveFocus();
    expect(code()).toHaveAttribute("type", "text");
    expect(code()).toHaveAttribute("autocomplete", "off");
    expect(code()).not.toHaveAttribute("maxlength");
    expect(date()).toHaveAttribute("type", "date");
    expect(date()).toHaveAttribute("min", "2026-11-21");
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
    expect(container.querySelector("form")).toHaveClass("bg-slate-50", "rounded-xl", "p-3");
    expect(container.textContent).not.toContain("*");
    expect(container.querySelector("[required]")).toBeNull();
    expect(code()).toHaveClass("ring-slate-300", "h-11");
    expect(container.querySelector("form")).toHaveAttribute("id", "shipping-panel-SL-1");
  });

  it("createdAt hỏng: bỏ min", () => {
    setup({ createdAt: "hỏng" });
    expect(date()).not.toHaveAttribute("min");
  });

  it("để trống: onSubmit với values rỗng, không lỗi", async () => {
    const { props } = setup();
    await userEvent.setup().click(submit());
    expect(props.onSubmit).toHaveBeenCalledWith({});
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("đủ hai trường: trim mã, giữ ngày", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.type(code(), "  GHN123  ");
    fireEvent.change(date(), { target: { value: "2026-11-25" } });
    await user.click(submit());
    expect(props.onSubmit).toHaveBeenCalledWith({
      trackingCode: "GHN123",
      expectedDeliveryDate: "2026-11-25",
    });
  });

  it("mã 51 ký tự: lỗi dưới ô, aria-invalid/describedby, không onSubmit, tiêu điểm ô mã; sửa ô thì lỗi mất", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    fireEvent.change(code(), { target: { value: "A".repeat(51) } });
    await user.click(submit());
    expect(props.onSubmit).not.toHaveBeenCalled();
    const err = screen.getByRole("alert");
    expect(err).toHaveTextContent("Mã vận đơn tối đa 50 ký tự.");
    expect(err).toHaveClass("text-rose-700");
    expect(code()).toHaveAttribute("aria-invalid", "true");
    expect(code()).toHaveAttribute("aria-describedby", err.id);
    expect(err.id).toBe("shipping-code-error-SL-1");
    expect(code()).toHaveClass("ring-rose-400");
    expect(code()).toHaveFocus();
    await user.type(code(), "x");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(code()).not.toHaveAttribute("aria-invalid");
    expect(code()).not.toHaveAttribute("aria-describedby");
  });

  it("hai lỗi cùng lúc: tiêu điểm ô mã; sửa ô mã không xóa lỗi ngày và ngược lại", async () => {
    const user = userEvent.setup();
    setup();
    fireEvent.change(code(), { target: { value: "A".repeat(51) } });
    fireEvent.change(date(), { target: { value: "2026-11-20" } });
    await user.click(submit());
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(code()).toHaveFocus();
    expect(date()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Ngày giao dự kiến không được sớm hơn ngày đặt hàng.")).toBeVisible();
    fireEvent.change(code(), { target: { value: "ok" } });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(date()).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(date(), { target: { value: "2026-11-21" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("chỉ lỗi ngày: tiêu điểm vào ô ngày", async () => {
    const user = userEvent.setup();
    setup();
    fireEvent.change(date(), { target: { value: "2026-11-20" } });
    await user.click(submit());
    expect(date()).toHaveFocus();
    expect(date()).toHaveAttribute("aria-describedby", "shipping-date-error-SL-1");
  });

  it.each([["A<b>"], [`A${ZWSP}B`]])("ký tự cấm %j: lỗi, không onSubmit", async (v) => {
    const user = userEvent.setup();
    const { props } = setup();
    fireEvent.change(code(), { target: { value: v } });
    await user.click(submit());
    expect(screen.getByRole("alert")).toHaveTextContent("Mã vận đơn chứa ký tự không hợp lệ.");
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("biên ngày: 21 gửi được, 20 lỗi", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    fireEvent.change(date(), { target: { value: "2026-11-20" } });
    await user.click(submit());
    expect(props.onSubmit).not.toHaveBeenCalled();
    fireEvent.change(date(), { target: { value: "2026-11-21" } });
    await user.click(submit());
    expect(props.onSubmit).toHaveBeenCalledWith({ expectedDeliveryDate: "2026-11-21" });
  });

  it("lỗi server theo ô: hiện đúng ô, thêm dấu chấm, giữ dữ liệu, tiêu điểm ô lỗi đầu", () => {
    const { rerender, props } = setup();
    fireEvent.change(code(), { target: { value: "GHN9" } });
    fireEvent.change(date(), { target: { value: "2026-11-25" } });
    rerender(
      <ShippingPanel
        {...props}
        serverErrors={{
          expectedDeliveryDate: "Ngày giao dự kiến không hợp lệ",
          trackingCode: "Mã sai.",
        }}
      />,
    );
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([
      "Mã sai.",
      "Ngày giao dự kiến không hợp lệ.",
    ]);
    expect(code()).toHaveValue("GHN9");
    expect(date()).toHaveValue("2026-11-25");
    expect(code()).toHaveFocus();
    expect(code()).toHaveAttribute("aria-invalid", "true");
  });

  it("lỗi server chỉ ô ngày: tiêu điểm ô ngày, ô mã không lỗi", () => {
    const { rerender, props } = setup();
    rerender(<ShippingPanel {...props} serverErrors={{ expectedDeliveryDate: "Sai" }} />);
    expect(date()).toHaveFocus();
    expect(code()).not.toHaveAttribute("aria-invalid");
  });

  it("lỗi chung: role=alert ở đáy, dữ liệu giữ, tiêu điểm nút gửi", () => {
    const { rerender, props } = setup();
    fireEvent.change(code(), { target: { value: "GHN9" } });
    rerender(<ShippingPanel {...props} generalError="Không kết nối được máy chủ." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Không kết nối được máy chủ.");
    expect(code()).toHaveValue("GHN9");
    expect(submit()).toBeEnabled();
    expect(submit()).toHaveFocus();
  });

  it("đang gửi: nút disabled đổi nhãn, hai ô readOnly, Esc bị bỏ qua, submit bị bỏ qua", () => {
    const { props } = setup({ pending: true });
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveTextContent("Đang chuyển…");
    expect(code()).toHaveAttribute("readonly");
    expect(date()).toHaveAttribute("readonly");
    fireEvent.keyDown(code(), { key: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.submit(code().closest("form") as HTMLFormElement);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("Esc khi rảnh gọi onClose", () => {
    const { props } = setup();
    fireEvent.keyDown(date(), { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("hai panel khác đơn: id không trùng", () => {
    render(
      <>
        <ShippingPanel {...makeProps({ orderId: "A" })} />
        <ShippingPanel {...makeProps({ orderId: "B" })} />
      </>,
    );
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("mã nguồn không chứa confirm(, toast, dialog, localStorage, required, maxLength, console, data-", () => {
    const src = readFileSync(
      join(process.cwd(), "src/features/staff/components/shipping-panel.tsx"),
      "utf8",
    );
    for (const banned of [
      "confirm(",
      "toast",
      "dialog",
      "localStorage",
      "required",
      "maxLength",
      "console",
      "data-",
      "logEvent",
      "[#",
      "rounded-[",
      "window.",
    ]) {
      expect(src, banned).not.toContain(banned);
    }
  });
});
