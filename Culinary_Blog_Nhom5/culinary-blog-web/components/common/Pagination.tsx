"use client";

import React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
              <ChevronLeft className="mr-1 size-4" aria-hidden="true" />
              Trang trước
            </Link>
          </Button>
        ) : (
          <Button variant="outline" className="rounded-xl" disabled aria-disabled="true">
            <ChevronLeft className="mr-1 size-4" aria-hidden="true" />
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
              props.onPageChange(page - 1);
            }
          }}
        >
          <ChevronLeft className="mr-1 size-4" aria-hidden="true" />
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
                  props.onPageChange(item);
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
              <ChevronRight className="ml-1 size-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" className="rounded-xl" disabled aria-disabled="true">
            Trang sau
            <ChevronRight className="ml-1 size-4" aria-hidden="true" />
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
              props.onPageChange(page + 1);
            }
          }}
        >
          Trang sau
          <ChevronRight className="ml-1 size-4" aria-hidden="true" />
        </Button>
      )}
    </nav>
  );
}

export default Pagination;
