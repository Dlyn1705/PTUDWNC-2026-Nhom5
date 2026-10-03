"use client";

import React, { useEffect, useRef, useState } from "react";
import { Bell, Pause, Play, RotateCcw, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function playChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    // Play warm culinary chime (two harmonious tones: A5 880Hz then C#6 1108Hz)
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.1);
    };

    playTone(880, 0, 0.8);
    playTone(1108.73, 0.25, 1.2);
  } catch {
    /* chime audio is decorative fallback */
  }
}

export function RecipeTimer({ minutes }: { minutes: number }) {
  const [total, setTotal] = useState(minutes * 60);
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [prevMinutes, setPrevMinutes] = useState(minutes);
  if (prevMinutes !== minutes) {
    setPrevMinutes(minutes);
    setTotal(minutes * 60);
    setRemaining(minutes * 60);
  }

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false);
          setDone(true);
          playChime();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const addOneMinute = () => {
    setRemaining((r) => r + 60);
    setTotal((t) => Math.max(t, remaining + 60));
    if (done) setDone(false);
  };

  const resetTimer = () => {
    setRunning(false);
    setDone(false);
    setRemaining(total);
  };

  const progressPercent = total > 0 ? Math.max(0, Math.min(100, ((total - remaining) / total) * 100)) : 0;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div
      className={cn(
        "mt-4 overflow-hidden rounded-2xl border transition-all duration-300",
        done
          ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
          : running
          ? "border-primary/40 bg-card shadow-soft"
          : "border-border bg-card/60"
      )}
    >
      {/* Progress Line */}
      <div className="h-1.5 w-full bg-muted/60">
        <div
          className={cn(
            "h-full transition-all duration-1000 ease-linear",
            done ? "bg-emerald-500" : "bg-primary"
          )}
          style={{ width: `${done ? 100 : progressPercent}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-3.5">
          {/* Animated pulsing timer status indicator */}
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-xl font-mono text-xs font-semibold",
              done
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                : running
                ? "bg-primary/10 text-primary animate-pulse"
                : "bg-muted text-muted-foreground"
            )}
          >
            {done ? <Bell className="size-5 text-emerald-600 animate-bounce" /> : <Sparkles className="size-4" />}
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl sm:text-3xl font-bold tabular-nums text-foreground tracking-tight">
                {mm}:{ss}
              </span>
              {done ? (
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Ready!
                </span>
              ) : (
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  {running ? "Cooking..." : `${minutes} min target`}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {done
                ? "Time is up! Check your food."
                : running
                ? "Kitchen timer is ticking."
                : "Timer ready when you start this step."}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={done ? "default" : running ? "secondary" : "default"}
            className={cn(
              "rounded-full px-4 h-9 shadow-soft font-medium text-xs gap-1.5 transition-all",
              done && "bg-emerald-600 hover:bg-emerald-700 text-white"
            )}
            onClick={() => {
              if (done) {
                resetTimer();
                setRunning(true);
                return;
              }
              setRunning((r) => !r);
            }}
          >
            {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {running ? "Pause" : done ? "Restart" : "Start"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="rounded-full px-3 h-9 text-xs gap-1"
            title="Add 1 minute"
            onClick={addOneMinute}
          >
            <Plus className="size-3" />
            <span>1m</span>
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="size-9 rounded-full text-muted-foreground hover:text-foreground"
            title="Reset timer"
            aria-label="Reset timer"
            onClick={resetTimer}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default RecipeTimer;
