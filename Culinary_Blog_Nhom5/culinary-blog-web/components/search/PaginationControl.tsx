import { Pagination } from "@/components/common/Pagination";
import { getPaginationItems, buildPaginationLinks } from "@/lib/pagination";

export interface PaginationControlProps {
  page: number;
  totalPages: number;
  href: (page: number) => string;
}

export function PaginationControl({ page, totalPages, href }: PaginationControlProps) {
  if (totalPages <= 1) return null;
  const items = getPaginationItems(page, totalPages);
  const links = buildPaginationLinks(items, page, totalPages, href);
  return (
    <Pagination
      mode="link"
      page={page}
      totalPages={totalPages}
      links={links}
      ariaLabel="Phân trang"
    />
  );
}

export default PaginationControl;
