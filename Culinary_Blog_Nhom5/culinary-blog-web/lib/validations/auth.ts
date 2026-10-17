import { z } from "zod";

const passwordStrengthRules = [
  { label: "Ít nhất 8 ký tự", matches: (password: string) => password.length >= 8 },
  { label: "Có chữ hoa", matches: (password: string) => /[A-Z]/.test(password) },
  { label: "Có chữ thường", matches: (password: string) => /[a-z]/.test(password) },
  { label: "Có chữ số", matches: (password: string) => /[0-9]/.test(password) },
  {
    label: "Có ký tự đặc biệt",
    matches: (password: string) => /[^a-zA-Z0-9]/.test(password),
  },
  { label: "Từ 12 ký tự trở lên", matches: (password: string) => password.length >= 12 },
] as const;

export function getPasswordStrength(password: string) {
  const criteria = passwordStrengthRules.map(({ label, matches }) => ({
    label,
    met: matches(password),
  }));
  const score = criteria.filter((criterion) => criterion.met).length;
  const label =
    password.length === 0
      ? "Chưa nhập"
      : score <= 2
        ? "Yếu"
        : score <= 4
          ? "Trung bình"
          : score === 5
            ? "Tốt"
            : "Mạnh";

  return { criteria, score, label };
}

export const registerSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Họ và tên phải có ít nhất 2 ký tự")
      .max(100, "Họ và tên không được vượt quá 100 ký tự"),
    email: z
      .string()
      .trim()
      .min(1, "Vui lòng nhập email")
      .email("Địa chỉ email không đúng định dạng")
      .max(256, "Email không được vượt quá 256 ký tự")
      .refine(
        (email) => email.toLowerCase().endsWith("@gmail.com"),
        "Vui lòng sử dụng địa chỉ Gmail kết thúc bằng @gmail.com",
      ),
    password: z
      .string()
      .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
      .regex(/[A-Z]/, "Mật khẩu phải có ít nhất 1 chữ hoa")
      .regex(/[a-z]/, "Mật khẩu phải có ít nhất 1 chữ thường")
      .regex(/[0-9]/, "Mật khẩu phải có ít nhất 1 chữ số")
      .regex(/[^a-zA-Z0-9]/, "Mật khẩu phải có ít nhất 1 ký tự đặc biệt"),
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập email")
    .email("Địa chỉ email không đúng định dạng")
    .max(256, "Email không được vượt quá 256 ký tự"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export type LoginFormData = z.infer<typeof loginSchema>;
