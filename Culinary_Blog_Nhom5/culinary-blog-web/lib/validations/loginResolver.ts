import type { Resolver } from "react-hook-form";
import type { LoginFormData } from "./auth";

type LoadResolver = () => Promise<Resolver<LoginFormData>>;

export function createLoginResolver(load: LoadResolver): Resolver<LoginFormData> {
  return async (values, context, options) => {
    try {
      return await (await load())(values, context, options);
    } catch {
      // Preserve inputs and allow another submit when a validation chunk cannot load.
      return {
        values: {},
        errors: { root: { type: "validation-unavailable", message: "Không thể kiểm tra thông tin đăng nhập. Vui lòng thử lại." } },
      };
    }
  };
}

export const loginResolver = createLoginResolver(async () => {
  const [{ zodResolver }, { loginSchema }] = await Promise.all([
    import("@hookform/resolvers/zod"), import("./auth"),
  ]);
  return zodResolver(loginSchema);
});
