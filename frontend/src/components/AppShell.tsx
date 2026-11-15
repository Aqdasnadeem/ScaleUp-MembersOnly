"use client";

import React from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSidebarPreference } from "@/hooks/useSidebarPreference";
import { getToken } from "@/lib/api";

const subscribeNoop = () => () => {};

function isPublicPath(pathname: string): boolean {
  return pathname === "/"
    || pathname === "/how-it-works"
    || pathname === "/login"
    || pathname === "/signin"
    || pathname === "/signup"
    || pathname === "/forgot-password"
    || pathname === "/reset-password"
    || pathname === "/demo"
    || pathname.startsWith("/demo/");
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = ["/login", "/signin", "/signup"].includes(pathname);
  const isDemoPage = pathname === "/demo" || pathname.startsWith("/demo/");
  const isProtectedPage = !isPublicPath(pathname);
  const hasToken = useSyncExternalStore(subscribeNoop, () => getToken() !== null, () => false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useSidebarPreference();
  const mobileMenuWasOpen = useRef(false);
  const isAllowed = !isProtectedPage || hasToken;

  const prefetchRouteOnIntent = (
    event: React.PointerEvent<HTMLElement> | React.FocusEvent<HTMLElement>,
  ) => {
    if (!(event.target instanceof Element)) return;

    const link = event.target.closest<HTMLAnchorElement>("a[href]");
    if (!link) return;
    if (
      event.type === "pointerover" &&
      event.relatedTarget instanceof Node &&
      link.contains(event.relatedTarget)
    ) {
      return;
    }

    const destination = new URL(link.href);
    if (destination.origin !== window.location.origin) return;
    if (
      destination.pathname === pathname &&
      destination.search === window.location.search
    ) {
      return;
    }

    router.prefetch(`${destination.pathname}${destination.search}`);
  };

  useEffect(() => {
    if (pathname === "/" && getToken()) {
      router.replace("/dashboard");
    } else if (isProtectedPage) {
      if (!getToken()) {
        const returnTo = `${window.location.pathname}${window.location.search}`;
        router.replace(`/login?next=${encodeURIComponent(returnTo)}`);
      }
    } else if (isAuthPage && getToken()) {
      router.replace("/dashboard");
    } else if (isDemoPage && getToken()) {
      router.replace("/dashboard");
    }
  }, [isAuthPage, isDemoPage, isProtectedPage, pathname, router]);

  useEffect(() => {
    if (isMobileMenuOpen && !mobileMenuWasOpen.current) {
      document.querySelector<HTMLAnchorElement>("#primary-navigation a[href]")?.focus();
    } else if (!isMobileMenuOpen && mobileMenuWasOpen.current) {
      document.getElementById("mobile-navigation-toggle")?.focus();
    }
    mobileMenuWasOpen.current = isMobileMenuOpen;
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMobileMenuOpen]);

  if (!isProtectedPage) {
    if (isDemoPage && hasToken) {
      return <main className="min-h-screen bg-[#F6F1E8]" aria-label="Opening your dashboard" />;
    }
    return (
      <div
        className="min-h-screen bg-[#F6F1E8]"
        onPointerOver={prefetchRouteOnIntent}
        onFocusCapture={prefetchRouteOnIntent}
      >
        {children}
      </div>
    );
  }
  if (!isAllowed) {
    return <main className="min-h-screen bg-[#F6F1E8]" aria-label="Checking account session" />;
  }

  return (
    <div
      className="flex min-h-screen bg-[#F6F1E8] text-[#1F2A44]"
      onPointerOver={prefetchRouteOnIntent}
      onFocusCapture={prefetchRouteOnIntent}
    >
      {isMobileMenuOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-[#131A2B]/55 lg:hidden"
        />
      )}
      <Sidebar
        isMobileOpen={isMobileMenuOpen}
        isCollapsed={isSidebarCollapsed}
        onNavigate={() => setIsMobileMenuOpen(false)}
        businessName="Your business"
        isDemo={false}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          isMobileMenuOpen={isMobileMenuOpen}
          onMenuClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
          isSidebarCollapsed={isSidebarCollapsed}
          onSidebarToggle={() => setIsSidebarCollapsed((isCollapsed) => !isCollapsed)}
        />
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
