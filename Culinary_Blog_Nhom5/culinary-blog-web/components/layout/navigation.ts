export interface NavigationItem {
  href: string;
  label: string;
}

export const primaryNavigation: readonly NavigationItem[] = [
  { href: "/recipes", label: "Công thức" },
  { href: "/categories", label: "Danh mục" },
];

export const footerNavigation: readonly NavigationItem[] = [
  { href: "/", label: "Trang chủ" },
  { href: "/recipes", label: "Tất cả công thức" },
  { href: "/categories", label: "Danh mục món ăn" },
  { href: "/search", label: "Tìm kiếm và bộ lọc" },
];

export function navigationItemIsActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
