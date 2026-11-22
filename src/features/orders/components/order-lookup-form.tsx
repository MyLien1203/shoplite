"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { normalizePhone } from "@/features/orders/normalize-phone";
import { cn } from "@/lib/cn";
import type { ApiErrorBody } from "@/lib/http";

const PHONE_INVALID_MESSAGE = "Số điện thoại không hợp lệ (ví dụ: 0912345678)";

interface OrderLookupFormProps {
  /** Mã đơn điền sẵn vào ô Mã đơn. */
  defaultOrderId?: string;
  /** Lời báo lỗi hiển thị ngay từ đầu (role="alert"). */
  initialError?: string;
}

export function OrderLookupForm({ defaultOrderId = "", initialError }: OrderLookupFormProps = {}) {
  const router = useRouter();
  const [values, setValues] = useState({ orderId: defaultOrderId, phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(initialError ?? null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const nextErrors: Record<string, string> = {};
    if (!values.orderId.trim()) nextErrors.orderId = "Vui lòng nhập Mã đơn.";
    if (!values.phone.trim()) nextErrors.phone = "Vui lòng nhập số điện thoại.";
    else if (normalizePhone(values.phone) === null) nextErrors.phone = PHONE_INVALID_MESSAGE;
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setStatus("submitting");
    try {
      const response = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: values.orderId.trim(), phone: values.phone.trim() }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        setSubmitError(body?.error.message ?? "Không thể tra cứu đơn hàng, vui lòng thử lại.");
        setStatus("idle");
        return;
      }

      const { orderId } = (await response.json()) as { orderId: string };
      router.push(`/orders/${orderId}`);
    } catch {
      setSubmitError("Không kết nối được máy chủ, vui lòng thử lại.");
      setStatus("idle");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
    >
      <Field label="Mã đơn" name="orderId" error={errors.orderId} required>
        <input
          id="orderId"
          name="orderId"
          value={values.orderId}
          onChange={handleChange}
          autoComplete="off"
          placeholder="SL-20261021-4F9A2C"
          aria-invalid={Boolean(errors.orderId)}
          className={cn(inputClass, errors.orderId ? "ring-rose-400" : "ring-slate-300")}
        />
      </Field>
      <Field label="Số điện thoại" name="phone" error={errors.phone} required>
        <input
          id="phone"
          name="phone"
          type="tel"
          value={values.phone}
          onChange={handleChange}
          autoComplete="tel"
          placeholder="0912345678"
          aria-invalid={Boolean(errors.phone)}
          className={cn(inputClass, errors.phone ? "ring-rose-400" : "ring-slate-300")}
        />
      </Field>
      {submitError && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {submitError}
        </p>
      )}
      <Button type="submit" size="lg" disabled={status !== "idle"}>
        {status === "submitting" ? "Đang tra cứu…" : "Xem đơn hàng"}
      </Button>
    </form>
  );
}
