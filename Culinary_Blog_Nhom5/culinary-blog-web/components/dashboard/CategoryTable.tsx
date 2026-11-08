"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Pencil, Trash2, ExternalLink, ChefHat, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryDto } from "@/types/category.types";

import { LoadingState } from "@/components/common/LoadingState";
import { Skeleton } from "@/components/common/Skeleton";
import { EmptyState } from "@/components/common/EmptyState";

interface CategoryTableProps {
  categories: CategoryDto[];
  isLoading: boolean;
  filtered?: boolean;
  onEdit: (category: CategoryDto) => void;
  onDelete: (category: CategoryDto) => void;
}

export function CategoryTable({
  categories,
  isLoading,
  filtered = false,
  onEdit,
  onDelete,
}: CategoryTableProps) {
  if (isLoading) return <LoadingState label="Đang tải danh mục…">
    {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
  </LoadingState>;
  if (categories.length === 0) return <EmptyState
    title={filtered ? "Không tìm thấy danh mục phù hợp" : "Chưa có danh mục nào"}
    description={filtered ? "Thử từ khóa khác hoặc xóa bộ lọc." : "Tạo danh mục đầu tiên để sắp xếp các công thức."} />;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="w-16 text-center text-xs font-semibold">Image</TableHead>
            <TableHead className="text-xs font-semibold">Category Name</TableHead>
            <TableHead className="text-xs font-semibold">Slug (URL)</TableHead>
            <TableHead className="text-center text-xs font-semibold">Recipes Count</TableHead>
            <TableHead className="text-center text-xs font-semibold">Order</TableHead>
            <TableHead className="text-right text-xs font-semibold pr-6">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody className="divide-y divide-border">
          {categories.map((cat) => {
            const totalRecipeCount = cat.totalRecipeCount ?? cat.recipeCount ?? 0;
            const hasRecipes = totalRecipeCount > 0;

            return (
              <TableRow
                key={cat.id}
                className="border-border hover:bg-muted/30 transition-colors"
              >
                {/* Thumbnail */}
                <TableCell className="p-3 text-center">
                  <div className="mx-auto size-11 overflow-hidden rounded-xl border border-border bg-muted">
                    {cat.imageUrl ? (
                      <Image
                        src={cat.imageUrl}
                        alt={cat.name}
                        width={44}
                        height={44}
                        unoptimized
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground/40">
                        <ChefHat className="size-5" />
                      </div>
                    )}
                  </div>
                </TableCell>

                {/* Name & Description */}
                <TableCell className="py-3">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-sm text-foreground">{cat.name}</p>
                    {cat.description && (
                      <p className="line-clamp-1 text-xs text-muted-foreground max-w-xs sm:max-w-md">
                        {cat.description}
                      </p>
                    )}
                  </div>
                </TableCell>

                {/* Slug */}
                <TableCell className="py-3">
                  <code className="rounded-lg bg-muted px-2 py-1 text-xs font-mono text-muted-foreground">
                    /{cat.slug}
                  </code>
                </TableCell>

                {/* Recipe Count Badge */}
                <TableCell className="py-3 text-center">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                      hasRecipes
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {cat.recipeCount || 0}
                  </span>
                </TableCell>

                {/* Order Index */}
                <TableCell className="py-3 text-center text-xs text-muted-foreground tabular-nums">
                  #{cat.orderIndex || 0}
                </TableCell>

                {/* Action Buttons */}
                <TableCell className="py-3 text-right pr-6">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                        aria-label={`Thao tác danh mục ${cat.name}`}
                      >
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>{cat.name}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href={`/categories/${cat.slug}`} target="_blank">
                          <ExternalLink aria-hidden="true" />
                          Xem trang công khai
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onEdit(cat)}>
                        <Pencil aria-hidden="true" />
                        Chỉnh sửa
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onDelete(cat)}>
                        <Trash2 aria-hidden="true" />
                        {hasRecipes ? "Xem lý do không thể xóa" : "Xóa danh mục"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default CategoryTable;
