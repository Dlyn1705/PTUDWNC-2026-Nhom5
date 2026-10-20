"use client";

import { useId, useState } from "react";

/** Native constraints, with persistent descriptions and predictable first-error focus. */
export function useRecipeValidation() {
  const prefix = useId();
  const id = (name: string) => `${prefix}-${name}`;
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
  const field = (name: string, hint?: string) => ({
    id: id(name),
    "aria-invalid": Boolean(errors[id(name)]),
    "aria-describedby": [hint ? id(hint) : undefined, errors[id(name)] ? `${id(name)}-error` : undefined].filter(Boolean).join(" ") || undefined,
  });
  const fieldError = (name: string) => errors[id(name)]
    ? <span id={`${id(name)}-error`} role="alert" className="mt-1 block text-sm text-red-600">{errors[id(name)]}</span> : null;
  return { id, validate, clear, field, fieldError };
}
