import type { Metadata } from "next";
import { RegisterForm } from "@/components/forms/RegisterForm";

export const metadata: Metadata = {
  title: "Đăng ký tài khoản | Culinary Blog",
  description:
    "Tham gia Culinary Blog để chia sẻ và khám phá những công thức nấu ăn hấp dẫn.",
};

export default function RegisterPage() {
  return (
    <main className="register-shell">
      <section className="register-brand-panel" aria-label="Culinary Blog">
        <div className="brand-mark">CB</div>
        <p className="eyebrow">Culinary Blog</p>
        <h1>Gom vị ngon, kể chuyện bếp.</h1>
        <p className="brand-copy">
          Một góc nhỏ cho những công thức đáng nhớ, những bữa ăn có câu chuyện
          và người nấu luôn muốn chia sẻ.
        </p>
        <div className="recipe-stamp" aria-hidden="true">
          <span>EST.</span>
          <strong>2026</strong>
          <span>COOK · SHARE · TASTE</span>
        </div>
      </section>

      <section className="register-form-panel">
        <div className="form-heading">
          <p className="eyebrow text-orange-700">Bắt đầu hành trình</p>
          <h2>Tạo tài khoản mới</h2>
          <p>Đăng ký để lưu công thức yêu thích và chia sẻ món ăn của bạn.</p>
        </div>
        <RegisterForm />
        <p className="form-footnote">
          Bằng việc tiếp tục, bạn đồng ý với điều khoản sử dụng của Culinary
          Blog.
        </p>
      </section>
    </main>
  );
}
