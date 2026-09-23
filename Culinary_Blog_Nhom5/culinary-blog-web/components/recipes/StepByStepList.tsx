"use client";

import React, { useState } from "react";
import { RecipeStepDto } from "@/types/recipe.types";
import { RecipeTimer } from "./RecipeTimer";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StepByStepListProps {
  steps: RecipeStepDto[];
}

export function StepByStepList({ steps }: StepByStepListProps) {
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});

  const toggleComplete = (id: string) => {
    setCompletedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const resetAll = () => {
    setCompletedSteps({});
  };

  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const isAllComplete = steps.length > 0 && completedCount === steps.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="font-display text-2xl font-semibold text-foreground">
            Instructions & Steps
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Follow along carefully, step by step. Use timers where provided.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold tabular-nums text-primary bg-primary/10 px-3 py-1 rounded-full">
            {completedCount} / {steps.length} completed
          </span>
          {completedCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs rounded-full text-muted-foreground hover:text-foreground gap-1"
              onClick={resetAll}
            >
              <RotateCcw className="size-3" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {isAllComplete && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="font-display font-semibold text-emerald-800 dark:text-emerald-300 text-base">
            🎉 All steps completed!
          </p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-400 mt-0.5">
            Your culinary masterpiece is ready to serve. Enjoy your meal!
          </p>
        </div>
      )}

      <div className="space-y-5">
        {sorted.map((step, idx) => {
          const stepNumber = step.order || idx + 1;
          const isDone = !!completedSteps[step.id];

          return (
            <div
              key={step.id}
              className={cn(
                "rounded-2xl border border-border bg-card p-6 shadow-soft transition-all duration-300",
                isDone && "bg-muted/30 border-muted"
              )}
            >
              <div className="flex items-start gap-4">
                {/* Step Number or Completed Check Button */}
                <button
                  type="button"
                  onClick={() => toggleComplete(step.id)}
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold transition-all cursor-pointer",
                    isDone
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "bg-primary text-primary-foreground shadow-soft hover:scale-105"
                  )}
                  title={isDone ? "Mark step as incomplete" : "Mark step as complete"}
                >
                  {isDone ? <Check className="size-4 stroke-[3]" /> : stepNumber}
                </button>

                <div className="flex-1 space-y-2">
                  {step.title && (
                    <h4
                      className={cn(
                        "font-display text-lg font-semibold",
                        isDone ? "line-through text-muted-foreground" : "text-foreground"
                      )}
                    >
                      {step.title}
                    </h4>
                  )}

                  <p
                    className={cn(
                      "text-sm leading-relaxed",
                      isDone ? "text-muted-foreground" : "text-foreground/90"
                    )}
                  >
                    {step.text}
                  </p>

                  {/* Step Image */}
                  {step.imageUrl && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-border max-w-lg shadow-2xs">
                      <img
                        src={step.imageUrl}
                        alt={step.title || `Step ${stepNumber}`}
                        className="aspect-video w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}

                  {/* Step Timer */}
                  {step.timerMinutes && step.timerMinutes > 0 ? (
                    <RecipeTimer minutes={step.timerMinutes} />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default StepByStepList;
