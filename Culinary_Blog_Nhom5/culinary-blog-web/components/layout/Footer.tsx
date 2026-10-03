"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChefHat, Heart, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setEmail("");
    }
  };

  return (
    <footer className="mt-28 border-t border-border bg-card/70 backdrop-blur-sm">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
        {/* Brand & Slogan */}
        <div className="space-y-4 md:col-span-2 lg:col-span-1">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft transition-transform group-hover:scale-105">
              <ChefHat className="size-5" />
            </span>
            <span className="font-display text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
              Culinary Blog
            </span>
          </Link>

          <p className="text-sm leading-relaxed text-muted-foreground max-w-xs">
            Slow, tested-twice recipes for real home kitchens and everyday ovens. Inspired by seasonal produce and mindful cooking.
          </p>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground shadow-2xs">
            <Sparkles className="size-3.5 text-primary" />
            <span>Honest food, clear steps</span>
          </div>
        </div>

        {/* Explore Navigation */}
        <div className="space-y-3.5">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-foreground">
            Explore
          </h3>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            <li>
              <Link href="/" className="transition-colors hover:text-primary">
                Home Page
              </Link>
            </li>
            <li>
              <Link href="/recipes" className="transition-colors hover:text-primary">
                All Recipes Catalog
              </Link>
            </li>
            <li>
              <Link href="/categories" className="transition-colors hover:text-primary">
                Recipe Categories
              </Link>
            </li>
            <li>
              <Link href="/search" className="transition-colors hover:text-primary">
                Search & Filters
              </Link>
            </li>
            <li>
              <Link href="/dashboard/categories" className="transition-colors hover:text-primary">
                Admin Management
              </Link>
            </li>
          </ul>
        </div>

        {/* Featured Categories */}
        <div className="space-y-3.5">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-foreground">
            Categories
          </h3>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            <li>
              <Link href="/categories/pasta" className="transition-colors hover:text-primary">
                Handmade Pasta
              </Link>
            </li>
            <li>
              <Link href="/categories/mains" className="transition-colors hover:text-primary">
                Slow Mains & Roasts
              </Link>
            </li>
            <li>
              <Link href="/categories/baking" className="transition-colors hover:text-primary">
                Artisan Baking
              </Link>
            </li>
            <li>
              <Link href="/categories/salads" className="transition-colors hover:text-primary">
                Crisp Garden Salads
              </Link>
            </li>
            <li>
              <Link href="/sitemap.xml" className="transition-colors hover:text-primary font-medium text-xs text-primary">
                XML Sitemap (SEO)
              </Link>
            </li>
          </ul>
        </div>

        {/* Newsletter Subscription */}
        <div className="space-y-3.5">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-foreground">
            Kitchen Newsletter
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            One tested recipe every Friday. No clutter, no ten-page preambles.
          </p>

          {subscribed ? (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50/70 p-3.5 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              <span>Thank you! We have added you to our Friday dispatch.</span>
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="space-y-2">
              <div className="relative">
                <Input
                  type="email"
                  required
                  placeholder="chef@kitchen.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl h-10 pr-20 bg-background border-border text-sm"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="absolute right-1 top-1 h-8 rounded-lg px-3.5 text-xs shadow-2xs font-semibold"
                >
                  Join
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/80">
                Zero spam. Unsubscribe anytime with one click.
              </p>
            </form>
          )}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-border/80 py-6 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} Culinary Blog. Designed with care for passionate cooks.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/sitemap.xml" className="hover:text-primary transition-colors">
              Sitemap
            </Link>
            <span className="text-border">•</span>
            <span className="inline-flex items-center gap-1">
              Cooked with <Heart className="size-3 text-primary fill-primary" /> twice tested
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
