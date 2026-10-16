"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRef, useState, type InputHTMLAttributes } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

type PasswordFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  registration: UseFormRegisterReturn;
  onVisibilityChange?: (visible: boolean) => void;
};

export function PasswordField({
  registration,
  onVisibilityChange,
  className,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const toggleVisibility = () => {
    const input = inputRef.current;
    const selectionStart = input?.selectionStart;
    const selectionEnd = input?.selectionEnd;

    const nextVisible = !visible;
    setVisible(nextVisible);
    onVisibilityChange?.(nextVisible);

    requestAnimationFrame(() => {
      if (!input) return;
      input.focus();
      if (typeof selectionStart === "number" && typeof selectionEnd === "number") {
        input.setSelectionRange(selectionStart, selectionEnd);
      }
    });
  };

  return (
    <div className="relative">
      <input
        {...registration}
        {...props}
        ref={(element) => {
          inputRef.current = element;
          registration.ref(element);
        }}
        type={visible ? "text" : "password"}
        className={`${className ?? ""} pr-12`}
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggleVisibility}
        aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-stone-500 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary"
      >
        {visible ? (
          <Eye size={18} aria-hidden="true" />
        ) : (
          <EyeOff size={18} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
