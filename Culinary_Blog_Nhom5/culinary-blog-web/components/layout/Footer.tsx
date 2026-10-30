import Link from "next/link";
import { ChefHat, Heart } from "lucide-react";
import { footerNavigation } from "@/components/layout/navigation";

export default function Footer() {
  return (
    <footer className="mt-28 border-t border-border bg-card/70">
      <div className="page-container grid gap-10 py-14 md:grid-cols-3">
        <div className="space-y-4 md:col-span-1">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft transition-transform motion-reduce:transition-none group-hover:scale-105">
              <ChefHat aria-hidden="true" className="size-5" />
            </span>
            <span className="font-display text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
              Culinary Blog
            </span>
          </Link>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Công thức đã được chọn lọc với nguyên liệu rõ ràng và từng bước dễ theo dõi cho căn bếp gia đình.
          </p>
        </div>

        <nav aria-label="Điều hướng chân trang" className="space-y-3.5">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-foreground">Khám phá</h2>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            {footerNavigation.map(item => (
              <li key={item.href}>
                <Link href={item.href} className="transition-colors hover:text-primary">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-3.5">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-foreground">Thông tin</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Nội dung công thức được trình bày cho mục đích tham khảo và học tập. Hãy điều chỉnh nguyên liệu theo nhu cầu dinh dưỡng của bạn.
          </p>
          <Link href="/sitemap.xml" className="inline-flex text-sm font-medium text-primary hover:underline">
            XML Sitemap
          </Link>
        </div>
      </div>

      <div className="border-t border-border/80 py-6">
        <div className="page-container flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Culinary Blog. Nhóm 5.</p>
          <span className="inline-flex items-center gap-1">
            Xây dựng với <Heart aria-hidden="true" className="size-3 fill-primary text-primary" /> sự quan tâm tới người nấu
          </span>
        </div>
      </div>
    </footer>
  );
}
