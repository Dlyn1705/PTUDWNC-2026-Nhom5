"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Clock, Flame, Printer, Share2, Timer, Users, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { RecipeDto } from "@/types/recipe.types";
import { DifficultyBadge } from "./RecipeCard";
import { cn } from "@/lib/utils";

interface RecipeHeroProps {
  recipe: RecipeDto;
}

export function RecipeHero({ recipe }: RecipeHeroProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const images = recipe.images || [];
  const activeImage = images[activeImageIndex] || images[0];
  const totalMinutes = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: recipe.title,
          text: recipe.description,
          url,
        });
        return;
      } catch {
        /* user dismissed share dialog or fallback to clipboard */
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const formattedDate = new Date(recipe.createdAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const categorySlug =
    recipe.categorySlug ||
    (recipe.categoryName ? recipe.categoryName.toLowerCase().replace(/\s+/g, "-") : recipe.categoryId);

  return (
    <section className="space-y-6">
      {/* Category, Difficulty & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {recipe.categoryName && (
            <Link
              href={`/categories/${categorySlug}`}
              className="rounded-full bg-accent px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-foreground transition-all hover:bg-accent/80 hover:scale-105"
            >
              {recipe.categoryName}
            </Link>
          )}

          <DifficultyBadge difficulty={recipe.difficulty} />

          {recipe.status !== 1 && <StatusBadge status={recipe.status} />}
        </div>

        {/* Action Buttons: Print & Share */}
        <div className="flex items-center gap-2 print:hidden">
          <Button
            size="sm"
            variant="outline"
            className="rounded-full gap-1.5 text-xs h-9 px-3.5 shadow-2xs hover:bg-accent hover:text-accent-foreground"
            onClick={handlePrint}
          >
            <Printer className="size-3.5" />
            <span>Print recipe</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            className={cn(
              "rounded-full gap-1.5 text-xs h-9 px-3.5 shadow-2xs transition-all",
              copied && "border-emerald-500 text-emerald-600 bg-emerald-50/50"
            )}
            onClick={handleShare}
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-emerald-600" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="size-3.5" />
                <span>Share</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Title & Description */}
      <div className="space-y-3">
        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.12]">
          {recipe.title}
        </h1>

        <p className="max-w-3xl text-base sm:text-lg leading-relaxed text-muted-foreground">
          {recipe.description}
        </p>
      </div>

      {/* Author & Publication Date */}
      <div className="flex items-center justify-between border-y border-border py-4">
        <div className="flex items-center gap-3">
          {recipe.author?.avatarUrl ? (
            <img
              src={recipe.author.avatarUrl}
              alt={recipe.author.displayName}
              className="size-11 rounded-full object-cover border-2 border-border shadow-2xs"
            />
          ) : (
            <div className="size-11 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm border-2 border-primary/20">
              {recipe.author?.displayName?.slice(0, 2) || "CB"}
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-foreground">
              By {recipe.author?.displayName || "Culinary Chef"}
            </p>
            <p className="text-xs text-muted-foreground">
              Published on {formattedDate}
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
          <Sparkles className="size-3.5 text-primary" />
          <span>Twice-tested recipe</span>
        </div>
      </div>

      {/* Quick Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="size-4 text-primary" />
            <span className="text-xs uppercase tracking-wider font-semibold">Prep Time</span>
          </div>
          <p className="text-xl font-bold tabular-nums text-foreground">
            {recipe.prepTimeMinutes} min
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Flame className="size-4 text-amber-500" />
            <span className="text-xs uppercase tracking-wider font-semibold">Cook Time</span>
          </div>
          <p className="text-xl font-bold tabular-nums text-foreground">
            {recipe.cookTimeMinutes} min
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Timer className="size-4 text-emerald-500" />
            <span className="text-xs uppercase tracking-wider font-semibold">Total Time</span>
          </div>
          <p className="text-xl font-bold tabular-nums text-foreground">
            {totalMinutes} min
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="size-4 text-primary" />
            <span className="text-xs uppercase tracking-wider font-semibold">Yield</span>
          </div>
          <p className="text-xl font-bold tabular-nums text-foreground">
            {recipe.servings} servings
          </p>
        </div>
      </div>

      {/* Hero Image & Gallery */}
      {activeImage && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-3xl border border-border bg-muted shadow-soft">
            <img
              src={activeImage.url}
              alt={activeImage.alt || recipe.title}
              className="aspect-[16/9] w-full object-cover transition-transform duration-700 hover:scale-[1.02]"
              loading="eager"
            />
          </div>

          {/* Thumbnail Gallery */}
          {images.length > 1 && (
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {images.map((img, idx) => (
                <button
                  key={img.id || idx}
                  type="button"
                  onClick={() => setActiveImageIndex(idx)}
                  className={cn(
                    "size-20 shrink-0 overflow-hidden rounded-xl border-2 transition-all cursor-pointer shadow-2xs",
                    activeImageIndex === idx
                      ? "border-primary shadow-soft scale-105"
                      : "border-transparent opacity-70 hover:opacity-100"
                  )}
                >
                  <img
                    src={img.url}
                    alt={img.alt || `Thumbnail ${idx + 1}`}
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default RecipeHero;
