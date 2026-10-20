import React from "react";
import { UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  headingLevel?: "h1" | "h2" | "h3" | "h4";
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  headingLevel = "h3",
}: EmptyStateProps) {
  const HeadingTag = headingLevel;

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center shadow-soft sm:p-12",
        className,
      )}
    >
      <div
        className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"
        aria-hidden="true"
      >
        {icon ?? <UtensilsCrossed className="size-7" />}
      </div>

      <HeadingTag className="mt-4 font-display text-lg font-bold text-foreground sm:text-xl">
        {title}
      </HeadingTag>

      {description && (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}

      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

export default EmptyState;
