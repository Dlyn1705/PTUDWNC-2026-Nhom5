"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChefHatIcon } from "../common/Icons";

export default function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
    }
  };

  return (
    <footer className="bg-[#f9fafb] border-t border-zinc-200/80 mt-auto text-zinc-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-16">
          {/* Column 1: Brand & Slogan */}
          <div className="md:col-span-4 space-y-4">
            <Link href="/" className="flex items-center gap-3 group inline-flex">
              <div className="w-9 h-9 rounded-full bg-[#DC4E3D] text-white flex items-center justify-center">
                <ChefHatIcon className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-zinc-900">
                Culinary Blog
              </span>
            </Link>
            <p className="text-zinc-600 text-sm leading-relaxed max-w-sm">
              Slow recipes, tested twice, written for real kitchens and imperfect ovens.
            </p>
          </div>

          {/* Column 2: Sitemap */}
          <div className="md:col-span-3 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
              Sitemap
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/" className="hover:text-zinc-900 transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/categories" className="hover:text-zinc-900 transition-colors">
                  All Categories
                </Link>
              </li>
              <li>
                <Link href="/categories/pasta" className="hover:text-zinc-900 transition-colors">
                  Pasta
                </Link>
              </li>
              <li>
                <Link href="/categories/mains" className="hover:text-zinc-900 transition-colors">
                  Mains
                </Link>
              </li>
              <li>
                <Link href="/categories/baking" className="hover:text-zinc-900 transition-colors">
                  Baking
                </Link>
              </li>
              <li>
                <Link href="/categories/salads" className="hover:text-zinc-900 transition-colors">
                  Salads
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-zinc-900 transition-colors">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Newsletter */}
          <div className="md:col-span-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
              Newsletter
            </h3>
            <p className="text-sm text-zinc-600">
              One recipe every Friday. No spam, no ten-paragraph preamble.
            </p>

            {subscribed ? (
              <div className="p-3 bg-[#FDF3EE] border border-[#F6D0BE] text-[#C2410C] rounded-xl text-sm font-medium">
                Thank you for subscribing! Check your inbox soon.
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex items-center gap-2 max-w-md">
                <input
                  type="email"
                  required
                  placeholder="you@kitchen.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-full border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#DC4E3D]/30 focus:border-[#DC4E3D] transition-all"
                />
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-full bg-[#DC4E3D] hover:bg-[#C43D2C] text-white text-sm font-medium transition-colors shadow-sm cursor-pointer"
                >
                  Join
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Bottom Bar: Copyright */}
        <div className="mt-16 pt-8 border-t border-zinc-200/60 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-4">
          <p>© 2026 Culinary Blog. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
