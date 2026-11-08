"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getPaginationItems,
  sanitizePageNumber,
  sanitizeTotalPages,
  type PaginationLinkItem,
} from "@/lib/pagination";

interface PaginationBaseProps {
  page: number;
  totalPages: number;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  scrollToTop?: boolean;
}

export interface PaginationLinkModeProps extends PaginationBaseProps {
  mode: "link";
  links: PaginationLinkItem[];
  previousHref?: string;
  nextHref?: string;
  onPageChange?: never;
}

export interface PaginationButtonModeProps extends PaginationBaseProps {
  mode: "button";
  onPageChange: (page: number) => void;
  links?: never;
  previousHref?: never;
  nextHref?: never;
}

export type PaginationProps = PaginationLinkModeProps | PaginationButtonModeProps;

export function Pagination(props: PaginationProps) {
  const {
    page: rawPage,
    totalPages: rawTotalPages,
    ariaLabel = "Phân trang",
    className,
    disabled = false,
    scrollToTop = true,
  } = props;

  const totalPages = sanitizeTotalPages(rawTotalPages);
  const page = sanitizePageNumber(rawPage, 1);

  // Hidden when 0 or 1 page
  if (totalPages <= 1) {
    return null;
  }

  const items = getPaginationItems(page, totalPages);
  if (items.length === 0) {
    return null;
  }

  const hasPrevious = page > 1 && page <= totalPages + 1;
  const hasNext = page >= 0 && page < totalPages;

  let prevHref: string | undefined;
  let nextHref: string | undefined;
  const linkMap = new Map<number, string>();

  if (props.mode === "link") {
    for (const item of props.links) {
      linkMap.set(item.page, item.href);
    }
    prevHref = props.previousHref ?? linkMap.get(page - 1);
    nextHref = props.nextHref ?? linkMap.get(page + 1);
  }

  const changePage = (targetPage: number) => {
    if (props.mode !== "button" || disabled) return;
    props.onPageChange(targetPage);
    if (scrollToTop) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <nav
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center justify-center gap-2 pt-2", className)}
    >
      {/* Previous Page Control */}
      {props.mode === "link" ? (
        !disabled && hasPrevious && prevHref ? (
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={prevHref}>
              <span aria-hidden="true" className="mr-1 text-base leading-none">‹</span>
              Trang trước
            </Link>
          </Button>
        ) : (
          <Button variant="outline" className="rounded-xl" disabled aria-disabled="true">
            <span aria-hidden="true" className="mr-1 text-base leading-none">‹</span>
            Trang trước
          </Button>
        )
      ) : (
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          disabled={disabled || !hasPrevious}
          aria-disabled={disabled || !hasPrevious}
          onClick={() => {
            if (!disabled && hasPrevious) {
              changePage(page - 1);
            }
          }}
        >
          <span aria-hidden="true" className="mr-1 text-base leading-none">‹</span>
          Trang trước
        </Button>
      )}

      {/* Page Numbers and Ellipsis */}
      <div
        className="flex items-center gap-1"
        aria-label={`Trang ${page} trong tổng số ${totalPages}`}
      >
        {items.map((item, index) => {
          if (typeof item !== "number") {
            return (
              <span
                key={`${item}-${index}`}
                className="select-none px-1 text-muted-foreground"
                aria-hidden="true"
              >
                …
              </span>
            );
          }

          const isCurrent = item === page;
          const variant = isCurrent ? "default" : "ghost";

          if (props.mode === "link") {
            const pageHref = linkMap.get(item);
            if (!disabled && pageHref) {
              return (
                <Button
                  key={item}
                  asChild
                  variant={variant}
                  size="sm"
                  className="min-w-9 rounded-lg"
                  aria-current={isCurrent ? "page" : undefined}
                >
                  <Link href={pageHref} aria-label={`Trang ${item}`}>
                    {item}
                  </Link>
                </Button>
              );
            }

            return (
              <Button
                key={item}
                variant={variant}
                size="sm"
                className="min-w-9 rounded-lg"
                disabled
                aria-disabled="true"
                aria-current={isCurrent ? "page" : undefined}
                aria-label={`Trang ${item}`}
              >
                <span>{item}</span>
              </Button>
            );
          }

          return (
            <Button
              key={item}
              type="button"
              variant={variant}
              size="sm"
              className="min-w-9 rounded-lg"
              disabled={disabled}
              aria-disabled={disabled}
              aria-current={isCurrent ? "page" : undefined}
              aria-label={`Trang ${item}`}
              onClick={() => {
                if (!disabled && item !== page) {
                  changePage(item);
                }
              }}
            >
              {item}
            </Button>
          );
        })}
      </div>

      {/* Next Page Control */}
      {props.mode === "link" ? (
        !disabled && hasNext && nextHref ? (
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={nextHref}>
              Trang sau
              <span aria-hidden="true" className="ml-1 text-base leading-none">›</span>
            </Link>
          </Button>
        ) : (
          <Button variant="outline" className="rounded-xl" disabled aria-disabled="true">
            Trang sau
            <span aria-hidden="true" className="ml-1 text-base leading-none">›</span>
          </Button>
        )
      ) : (
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          disabled={disabled || !hasNext}
          aria-disabled={disabled || !hasNext}
          onClick={() => {
            if (!disabled && hasNext) {
              changePage(page + 1);
            }
          }}
        >
          Trang sau
          <span aria-hidden="true" className="ml-1 text-base leading-none">›</span>
        </Button>
      )}
    </nav>
  );
}

export default Pagination;
