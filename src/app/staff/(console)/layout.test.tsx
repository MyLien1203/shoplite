import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StaffConsoleLayout from "./layout";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/staff",
}));

describe("(console)/layout", () => {
  it("bọc data-staff-shell, có staff-nav và render con", () => {
    const { container } = render(
      <StaffConsoleLayout>
        <p>nội dung con</p>
      </StaffConsoleLayout>,
    );
    const shell = container.querySelector("[data-staff-shell]");
    expect(shell).not.toBeNull();
    expect(shell).toContainElement(screen.getByTestId("staff-nav"));
    expect(shell).toContainElement(screen.getByText("nội dung con"));
  });
});
