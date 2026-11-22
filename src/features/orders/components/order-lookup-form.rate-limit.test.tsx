import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderLookupForm } from "./order-lookup-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const RATE_LIMITED = "Bạn đã thử sai quá nhiều lần. Vui lòng thử lại sau 15 phút.";

describe("OrderLookupForm - 429", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    push.mockReset();
  });

  it("hiện lời của server trong role=alert, nút bật lại, giữ giá trị đã nhập", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: RATE_LIMITED } }), {
          status: 429,
        }),
      ),
    );
    render(<OrderLookupForm />);
    await userEvent.type(screen.getByLabelText(/Mã đơn/), "SL-X");
    await userEvent.type(screen.getByLabelText(/Số điện thoại/), "0912345678");
    await userEvent.click(screen.getByRole("button", { name: "Xem đơn hàng" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(RATE_LIMITED);
    expect(screen.getByRole("button", { name: "Xem đơn hàng" })).toBeEnabled();
    expect(screen.getByLabelText(/Mã đơn/)).toHaveValue("SL-X");
    expect(screen.getByLabelText(/Số điện thoại/)).toHaveValue("0912345678");
    expect(push).not.toHaveBeenCalled();
  });
});
