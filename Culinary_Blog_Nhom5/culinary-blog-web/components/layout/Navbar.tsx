"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChefHatIcon, SearchIcon, FilterIcon } from "../common/Icons";

export default function Navbar() {
  const pathname = usePathname();

  const isCategoriesActive = pathname === "/categories" || pathname.startsWith("/categories/");
  const isRecipesActive = pathname === "/recipes" || pathname.startsWith("/recipes/");

  return (
    <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-md border-b border-zinc-100 transition-shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Left Side: Brand Logo & Navigation */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-full bg-[#DC4E3D] text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform duration-200">
              <ChefHatIcon className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-zinc-900 group-hover:text-[#DC4E3D] transition-colors">
              Culinary Blog
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-2 text-sm">
            <Link
              href="/recipes"
              className={`px-3 py-1.5 rounded-full transition-colors ${
                isRecipesActive
                  ? "bg-[#FDF3EE] text-[#C2410C] font-semibold"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              All recipes
            </Link>

            <Link
              href="/categories"
              className={`px-3.5 py-1.5 rounded-full transition-colors ${
                isCategoriesActive
                  ? "bg-[#FDF3EE] text-[#C2410C] font-semibold"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Categories
            </Link>

            <Link
              href="/categories/pasta"
              className="px-3 py-1.5 text-zinc-600 hover:text-zinc-900 rounded-full transition-colors"
            >
              Pasta
            </Link>

            <Link
              href="/categories/mains"
              className="px-3 py-1.5 text-zinc-600 hover:text-zinc-900 rounded-full transition-colors"
            >
              Mains
            </Link>

            <Link
              href="/categories/baking"
              className="px-3 py-1.5 text-zinc-600 hover:text-zinc-900 rounded-full transition-colors"
            >
              Baking
            </Link>
          </nav>
        </div>

        {/* Right Side: Search & Sign In */}
        <div className="flex items-center gap-3">
          <Link
            href="/search"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 text-sm transition-colors shadow-2xs"
          >
            <SearchIcon className="w-4 h-4 text-zinc-500" />
            <span className="text-zinc-600">Search</span>
            <span className="p-0.5 text-zinc-400">
              <FilterIcon className="w-3.5 h-3.5" />
            </span>
          </Link>

          <Link
            href="/auth/login"
            className="px-5 py-2 rounded-full bg-[#DC4E3D] hover:bg-[#C43D2C] text-white text-sm font-medium transition-colors shadow-sm"
          >
            Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}
