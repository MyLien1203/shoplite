"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ApiErrorBody } from "@/lib/http";

const NETWORK_MESSAGE = "Không kết nối được máy chủ, vui lòng thử lại.";
const EMPTY_MESSAGE = "Vui lòng nhập mật khẩu.";
const WRONG_MESSAGE = "Mật khẩu không đúng.";

const inputClass =
  "h-11 w-full rounded-xl border-0 bg-white px-3 text-sm ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none";

interface StaffLoginFormProps {
  expired?: boolean;
}

export function StaffLoginForm({ expired = false }: StaffLoginFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");

  function handleChange() {
    setFieldError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    // Input không kiểm soát: mật khẩu không được phản chiếu vào thuộc tính DOM `value`.
    const password = inputRef.current?.value ?? "";
    if (password === "") {
      setFieldError(EMPTY_MESSAGE);
      return;
    }

    setFieldError(null);
    setStatus("submitting");

    try {
      const response = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        setStatus("done");
        router.replace("/staff");
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
      const message = body?.error?.message;
      if (response.status === 401) {
        setFieldError(message ?? WRONG_MESSAGE);
      } else {
        setSubmitError(message ?? NETWORK_MESSAGE);
      }
      setStatus("idle");
    } catch {
      setSubmitError(NETWORK_MESSAGE);
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {expired && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          Phiên đã hết hạn, vui lòng đăng nhập lại.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-slate-700">
          Mật khẩu
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          ref={inputRef}
          onChange={handleChange}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? "password-error" : undefined}
          className={cn(inputClass, fieldError ? "ring-rose-400" : "ring-slate-300")}
        />
        {fieldError && (
          <p id="password-error" className="text-xs text-rose-600">
            {fieldError}
          </p>
        )}
      </div>
      {submitError && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {submitError}
        </p>
      )}
      <Button type="submit" size="lg" disabled={status !== "idle"}>
        {status === "idle" ? "Đăng nhập" : "Đang đăng nhập…"}
      </Button>
    </form>
  );
}
