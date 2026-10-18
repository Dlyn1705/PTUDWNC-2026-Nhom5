"use client";

import { useState } from "react";

/** Native constraints, with persistent descriptions and predictable first-error focus. */
export function useRecipeValidation() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const validate = (form: HTMLFormElement) => {
    const next: Record<string, string> = {};
    let first: HTMLElement | undefined;
    for (const element of Array.from(form.elements)) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement) || !element.willValidate || !element.id) continue;
      let error = element.validity.valid ? "" : element.validationMessage;
      if (element.id.endsWith("-title") && element.value.trim().length < 3)
        error = "Tên công thức phải từ 3 đến 200 ký tự.";
      if (error) { next[element.id] = error; first ??= element; }
    }
    setErrors(next);
    first?.focus();
    return !first;
  };
  const clear = (target: EventTarget) => {
    if (!(target instanceof HTMLElement) || !target.id) return;
    const id = target.id;
    setErrors(current => {
      if (!current[id]) return current;
      const next = { ...current }; delete next[id]; return next;
    });
  };
  const field = (id: string, hint?: string) => ({
    id,
    "aria-invalid": Boolean(errors[id]),
    "aria-describedby": [hint, errors[id] ? `${id}-error` : undefined].filter(Boolean).join(" ") || undefined,
  });
  const fieldError = (id: string) => errors[id]
    ? <span id={`${id}-error`} role="alert" className="mt-1 block text-sm text-red-600">{errors[id]}</span> : null;
  return { validate, clear, field, fieldError };
}
