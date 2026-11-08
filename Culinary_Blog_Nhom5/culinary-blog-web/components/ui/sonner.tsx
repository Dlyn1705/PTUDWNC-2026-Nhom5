"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import { cn } from "@/lib/utils";

const Toaster = ({ className, toastOptions, ...props }: ToasterProps) => (
  <Sonner
    className={cn("toaster group", className)}
    toastOptions={{
      ...toastOptions,
      classNames: {
        toast: "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lift",
        description: "group-[.toast]:text-muted-foreground",
        actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
        cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        error: "group-[.toaster]:border-destructive/40 group-[.toaster]:text-destructive",
        ...toastOptions?.classNames,
      },
    }}
    {...props}
  />
);

export { Toaster };
