import type { ReactNode } from "react";
import { StaffNav } from "@/features/staff/components/staff-nav";

// Khung nhân viên. Việc kiểm quyền nằm ở từng page.tsx, không ở layout.
export default function StaffConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <div data-staff-shell>
      <StaffNav />
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
