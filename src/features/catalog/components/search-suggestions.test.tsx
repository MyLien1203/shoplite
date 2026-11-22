import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchSuggestions, SUGGEST_DEBOUNCE_MS } from "./search-suggestions";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const USB = [
  { slug: "cap-usb-c-ben-du-2m", name: "Cáp USB-C bện dù 2m", price: 150_000, inStock: true },
  { slug: "micro-thu-am-podcast-usb", name: "Micro thu âm PodCast USB", price: 1_150_000, inStock: false },
];

function mockFetch(suggestions: unknown[] = USB, ok = true) {
  const fetchMock = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ suggestions }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const input = () => screen.getByRole("combobox", { name: "Từ khóa tìm kiếm" });

async function typeAndWait(text: string) {
  fireEvent.focus(input());
  fireEvent.change(input(), { target: { value: text } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
  });
}

describe("SearchSuggestions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("dưới 2 ký tự: không gọi API, không hiện danh sách (AC-3)", async () => {
    const fetchMock = mockFetch();
    render(<SearchSuggestions />);
    await typeAndWait("a");
    await typeAndWait("  b ");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("chờ 300 ms rồi mới gọi API một lần, hiện tên, giá và nhãn Hết hàng (AC-1, AC-5)", async () => {
    const fetchMock = mockFetch();
    render(<SearchSuggestions />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "us" } });
    fireEvent.change(input(), { target: { value: "usb" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS - 1);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/products/suggest?q=usb", expect.anything());

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Cáp USB-C bện dù 2m");
    expect(options[0]).toHaveTextContent("150.000");
    expect(options[0]).not.toHaveTextContent("Hết hàng");
    expect(options[1]).toHaveTextContent("Hết hàng");
  });

  it("bấm vào gợi ý mở trang chi tiết (AC-2)", async () => {
    mockFetch();
    render(<SearchSuggestions />);
    await typeAndWait("usb");
    fireEvent.mouseDown(screen.getAllByRole("option")[1]);
    expect(push).toHaveBeenCalledWith("/products/micro-thu-am-podcast-usb");
  });

  it("↓ ↓ ↑ rồi Enter mở gợi ý đang chọn; Esc đóng danh sách (AC-2)", async () => {
    mockFetch();
    render(<SearchSuggestions />);
    await typeAndWait("usb");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    expect(input()).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0].id);
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/products/cap-usb-c-ben-du-2m");

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input()).toHaveAttribute("aria-expanded", "false");
  });

  it("Enter khi chưa chọn gợi ý thì không chặn submit form (nút Tìm kiếm giữ nguyên)", async () => {
    mockFetch();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <SearchSuggestions />
      </form>,
    );
    await typeAndWait("usb");
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    input().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("không có kết quả: ghi 'Không tìm thấy sản phẩm phù hợp'", async () => {
    mockFetch([]);
    render(<SearchSuggestions />);
    await typeAndWait("xyz");
    expect(screen.getByRole("listbox")).toHaveTextContent("Không tìm thấy sản phẩm phù hợp");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("API lỗi: không hiện danh sách; blur đóng danh sách", async () => {
    mockFetch(USB, false);
    render(<SearchSuggestions defaultValue="usb" />);
    await typeAndWait("usb");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    mockFetch();
    await typeAndWait("usb-c");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getAllByRole("option")[1]);
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.blur(input());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
