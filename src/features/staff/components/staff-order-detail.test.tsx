import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Order } from "@/features/orders/types";
import { StaffOrderDetail } from "./staff-order-detail";

const NOW = Date.parse("2026-11-22T10:00:00.000Z");
const CREATED = "2026-11-22T07:00:00.000Z";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "SL-20261122-ABCDEF",
    status: "shipping",
    createdAt: CREATED,
    updatedAt: CREATED,
    customer: {
      fullName: "Nguyễn Văn An",
      phone: "0912345678",
      email: "an@example.com",
      address: "12 Nguyễn Huệ, Quận 1",
      note: "Gọi trước khi giao",
    },
    shippingMethod: "standard",
    paymentMethod: "cod",
    items: [
      {
        productId: "p1",
        slug: "ao-thun",
        name: "Áo thun",
        image: { emoji: "👕", from: "#fff", to: "#eee" },
        unitPrice: 100_000,
        quantity: 2,
        lineTotal: 200_000,
      },
    ],
    subtotal: 200_000,
    shippingFee: 0,
    total: 200_000,
    source: "web",
    statusHistory: [
      { status: "pending", at: CREATED },
      { status: "confirmed", at: "2026-11-22T08:00:00.000Z" },
      { status: "shipping", at: "2026-11-22T09:00:00.000Z" },
    ],
    trackingCode: "GHN123",
    expectedDeliveryDate: "2026-11-25",
    internalNotes: [],
    ...overrides,
  };
}

const note = (id: string, text: string, createdAt: string) => ({ id, text, createdAt });

describe("<StaffOrderDetail />", () => {
  it("đơn web đang giao: đủ khối theo thứ tự h1/h2 của AC", () => {
    render(
      <StaffOrderDetail
        order={makeOrder({
          internalNotes: [note("n1", "Ghi chú A", "2026-11-22T08:30:00.000Z")],
        })}
        now={NOW}
      />,
    );
    const headings = screen.getAllByRole("heading").map((h) => [h.tagName, h.textContent]);
    expect(headings).toEqual([
      ["H1", "SL-20261122-ABCDEF"],
      ["H2", "Sản phẩm"],
      ["H2", "Người nhận"],
      ["H2", "Giao hàng & thanh toán"],
      ["H2", "Giao hàng"],
      ["H2", "Lịch sử trạng thái"],
      ["H2", "Ghi chú nội bộ"],
    ]);
  });

  it("đơn web: tiêu đề, trạng thái, tuổi đơn, đặt lúc, nguồn, liên kết quay lại", () => {
    render(<StaffOrderDetail order={makeOrder()} now={NOW} />);
    expect(screen.getByRole("link", { name: "← Đơn cần xử lý" })).toHaveAttribute("href", "/staff");
    expect(screen.getByText("Tuổi đơn: 3 giờ")).toBeVisible();
    expect(screen.getByText(/^Đặt lúc /)).toBeVisible();
    expect(screen.getByText("Web")).toBeVisible();
    expect(screen.getAllByText("Đang giao").length).toBeGreaterThan(0);
  });

  it("sản phẩm, tổng tiền và 'Miễn phí' khi phí giao 0; không liên kết sản phẩm", () => {
    render(<StaffOrderDetail order={makeOrder()} now={NOW} />);
    expect(screen.getByText("Áo thun")).toBeVisible();
    expect(screen.getByRole("img", { name: "Áo thun" })).toBeVisible();
    expect(screen.getByText("Miễn phí")).toBeVisible();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links.some((a) => a.getAttribute("href")?.startsWith("/products"))).toBe(false);
  });

  it("phí giao khác 0 hiện số tiền", () => {
    render(
      <StaffOrderDetail order={makeOrder({ shippingFee: 30_000, total: 230_000 })} now={NOW} />,
    );
    expect(screen.queryByText("Miễn phí")).toBeNull();
  });

  it("người nhận đủ trường và nhãn giao hàng/thanh toán", () => {
    render(<StaffOrderDetail order={makeOrder({ paymentMethod: "bank_transfer" })} now={NOW} />);
    expect(screen.getByText("Nguyễn Văn An")).toBeVisible();
    expect(screen.getByText("0912345678")).toBeVisible();
    expect(screen.getByText("an@example.com")).toBeVisible();
    expect(screen.getByText("12 Nguyễn Huệ, Quận 1")).toBeVisible();
    expect(screen.getByText("Ghi chú của khách: Gọi trước khi giao")).toBeVisible();
    expect(screen.getByText("Giao hàng tiêu chuẩn")).toBeVisible();
    expect(screen.getByText("Chuyển khoản ngân hàng")).toBeVisible();
  });

  it("khối Giao hàng: mã vận đơn và ngày giao dự kiến 25/11/2026 (cắt chuỗi)", () => {
    render(<StaffOrderDetail order={makeOrder()} now={NOW} />);
    expect(screen.getByText("Mã vận đơn: GHN123")).toBeVisible();
    expect(screen.getByText("Ngày giao dự kiến: 25/11/2026")).toBeVisible();
  });

  it("chỉ có một trong hai trường vận đơn thì chỉ hiện trường đó", () => {
    const { rerender } = render(
      <StaffOrderDetail order={makeOrder({ expectedDeliveryDate: undefined })} now={NOW} />,
    );
    expect(screen.getByText("Mã vận đơn: GHN123")).toBeVisible();
    expect(screen.queryByText(/Ngày giao dự kiến/)).toBeNull();
    rerender(<StaffOrderDetail order={makeOrder({ trackingCode: undefined })} now={NOW} />);
    expect(screen.queryByText(/Mã vận đơn/)).toBeNull();
    expect(screen.getByText("Ngày giao dự kiến: 25/11/2026")).toBeVisible();
  });

  it("đơn tạo tay không email/ghi chú khách/vận đơn: nhãn Tạo tay, timeline từ Đã xác nhận", () => {
    render(
      <StaffOrderDetail
        order={makeOrder({
          source: "manual",
          status: "confirmed",
          customer: { fullName: "Trần B", phone: "0987654321", address: "Hà Nội" },
          trackingCode: undefined,
          expectedDeliveryDate: undefined,
          statusHistory: [{ status: "confirmed", at: CREATED }],
        })}
        now={NOW}
      />,
    );
    expect(screen.getByText("Tạo tay")).toBeVisible();
    expect(screen.queryByText("Web")).toBeNull();
    expect(screen.queryByText(/@/)).toBeNull();
    expect(screen.queryByText(/Ghi chú của khách/)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Giao hàng", level: 2 })).toBeNull();
    const steps = within(screen.getByRole("list", { name: "Tiến trình đơn hàng" })).getAllByRole(
      "listitem",
    );
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent("Đã xác nhận");
  });

  it("đơn đã hủy: timeline dừng ở Đã hủy, không khối vận đơn", () => {
    render(
      <StaffOrderDetail
        order={makeOrder({
          status: "cancelled",
          trackingCode: undefined,
          expectedDeliveryDate: undefined,
          statusHistory: [
            { status: "pending", at: CREATED },
            { status: "cancelled", at: "2026-11-22T08:00:00.000Z" },
          ],
        })}
        now={NOW}
      />,
    );
    const steps = within(screen.getByRole("list", { name: "Tiến trình đơn hàng" })).getAllByRole(
      "listitem",
    );
    expect(steps.at(-1)).toHaveTextContent("Đã hủy");
    expect(screen.queryByText(/Mã vận đơn/)).toBeNull();
  });

  it("có timeline ol[aria-label]", () => {
    const { container } = render(<StaffOrderDetail order={makeOrder()} now={NOW} />);
    const ol = container.querySelector('ol[aria-label="Tiến trình đơn hàng"]');
    expect(ol).not.toBeNull();
    expect(ol?.querySelectorAll("li")).toHaveLength(4);
  });

  it("ghi chú nội bộ: mới nhất trước, nhãn 'Chỉ nhân viên thấy', không ô nhập/nút", () => {
    render(
      <StaffOrderDetail
        order={makeOrder({
          internalNotes: [
            note("n1", "Cũ nhất", "2026-11-22T06:00:00.000Z"),
            note("n3", "Mới nhất", "2026-11-22T09:00:00.000Z"),
            note("n2", "Giữa", "2026-11-22T08:00:00.000Z"),
          ],
        })}
        now={NOW}
      />,
    );
    expect(screen.getByText("Chỉ nhân viên thấy")).toBeVisible();
    const section = screen.getByRole("heading", { name: "Ghi chú nội bộ" }).closest("section")!;
    const items = within(section).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("p:last-child")?.textContent)).toEqual([
      "Mới nhất",
      "Giữa",
      "Cũ nhất",
    ]);
    items.forEach((li) => expect(li.querySelector("p")?.textContent).toMatch(/\d/));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("ghi chú cùng thời điểm: theo thứ tự mảng ngược", () => {
    const at = "2026-11-22T08:00:00.000Z";
    render(
      <StaffOrderDetail
        order={makeOrder({
          internalNotes: [note("a", "Trước", at), note("b", "Sau", at)],
        })}
        now={NOW}
      />,
    );
    const items = screen
      .getAllByRole("listitem")
      .filter((li) => li.textContent?.match(/Trước|Sau/));
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Sau"),
      expect.stringContaining("Trước"),
    ]);
  });

  it("không có ghi chú: không có khối ghi chú", () => {
    render(<StaffOrderDetail order={makeOrder()} now={NOW} />);
    expect(screen.queryByRole("heading", { name: "Ghi chú nội bộ" })).toBeNull();
    expect(screen.queryByText("Chỉ nhân viên thấy")).toBeNull();
  });

  it("thời điểm ghi chú hỏng: không ném, bỏ giờ, vẫn hiện nội dung", () => {
    render(
      <StaffOrderDetail
        order={makeOrder({ internalNotes: [note("n1", "Nội dung hỏng giờ", "không-phải-ngày")] })}
        now={NOW}
      />,
    );
    expect(screen.getByText("Nội dung hỏng giờ")).toBeVisible();
  });

  it("createdAt của đơn hỏng: không ném, bỏ 'Đặt lúc'", () => {
    render(<StaffOrderDetail order={makeOrder({ createdAt: "hỏng" })} now={NOW} />);
    expect(screen.queryByText(/Đặt lúc/)).toBeNull();
    expect(screen.getByText("Tuổi đơn: Không rõ")).toBeVisible();
  });

  it("actions render khi có; vắng thì không có nút nào", () => {
    const { rerender } = render(<StaffOrderDetail order={makeOrder()} now={NOW} />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(
      <StaffOrderDetail order={makeOrder()} now={NOW} actions={<button>Hành động thử</button>} />,
    );
    expect(screen.getByRole("button", { name: "Hành động thử" })).toBeVisible();
  });

  it("chuỗi dài 200 ký tự: có break-words, không whitespace-nowrap", () => {
    const long = "x".repeat(200);
    const { container } = render(
      <StaffOrderDetail
        order={makeOrder({
          customer: { fullName: long, phone: "0912345678", address: long, note: long },
          internalNotes: [note("n1", long, CREATED)],
        })}
        now={NOW}
      />,
    );
    expect(screen.getByText(long, { selector: "p.font-medium" })).toHaveClass("break-words");
    expect(screen.getAllByText(long, { exact: false }).length).toBeGreaterThanOrEqual(4);
    expect(container.innerHTML).not.toContain("whitespace-nowrap");
    expect(container.querySelector(".sm\\:grid-cols-2")).not.toBeNull();
  });

  it("nội dung giống HTML hiện nguyên văn, không chèn phần tử", () => {
    const html = "<img src=x onerror=alert(1)>";
    const { container } = render(
      <StaffOrderDetail
        order={makeOrder({
          customer: { fullName: "A", phone: "0912345678", address: "B", note: html },
          internalNotes: [note("n1", html, CREATED)],
        })}
        now={NOW}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText(html, { exact: false }).length).toBe(2);
  });
});
