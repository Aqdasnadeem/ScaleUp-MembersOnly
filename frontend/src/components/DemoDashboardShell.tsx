"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { useSidebarPreference } from "@/hooks/useSidebarPreference";

export default function DemoDashboardShell({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useSidebarPreference();
  const mobileMenuWasOpen = useRef(false);

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

  return (
    <div className="flex min-h-screen bg-[#F6F1E8] text-[#1F2A44]">
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
        businessName="Demo account"
        isDemo
        isPreview
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          isMobileMenuOpen={isMobileMenuOpen}
          onMenuClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
          isSidebarCollapsed={isSidebarCollapsed}
          onSidebarToggle={() => setIsSidebarCollapsed((isCollapsed) => !isCollapsed)}
          isPreview
        />
        <main className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
