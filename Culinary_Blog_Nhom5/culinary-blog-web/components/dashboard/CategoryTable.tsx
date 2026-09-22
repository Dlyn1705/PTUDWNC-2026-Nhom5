"use client";

import React from "react";
import Link from "next/link";
import { Pencil, Trash2, ExternalLink, ChefHat, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryDto } from "@/types/category.types";

interface CategoryTableProps {
  categories: CategoryDto[];
  isLoading: boolean;
  onEdit: (category: CategoryDto) => void;
  onDelete: (category: CategoryDto) => void;
}

export function CategoryTable({
  categories,
  isLoading,
  onEdit,
  onDelete,
}: CategoryTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
        <div className="inline-block size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-3 text-xs text-muted-foreground font-medium">Loading category catalog...</p>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-soft">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
          <Layers className="size-6" />
        </div>
        <h3 className="font-display text-lg font-semibold text-foreground">
          No categories created yet
        </h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
          Start by adding your first food category to organize culinary recipes.
        </p>
      </div>
    );
  }

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
            const hasRecipes = (cat.recipeCount || 0) > 0;

            return (
              <TableRow
                key={cat.id}
                className="border-border hover:bg-muted/30 transition-colors"
              >
                {/* Thumbnail */}
                <TableCell className="p-3 text-center">
                  <div className="mx-auto size-11 overflow-hidden rounded-xl border border-border bg-muted">
                    {cat.imageUrl ? (
                      <img
                        src={cat.imageUrl}
                        alt={cat.name}
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
                  <div className="inline-flex items-center gap-1.5">
                    <Button
                      asChild
                      size="icon"
                      variant="ghost"
                      className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                      title="View public category page"
                    >
                      <Link href={`/categories/${cat.slug}`} target="_blank">
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                      onClick={() => onEdit(cat)}
                      title="Edit category"
                    >
                      <Pencil className="size-3.5" />
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      className={`size-8 rounded-lg transition-colors ${
                        hasRecipes
                          ? "text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10"
                          : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      }`}
                      onClick={() => onDelete(cat)}
                      title={
                        hasRecipes
                          ? "Cannot delete category containing recipes"
                          : "Delete category"
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
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
