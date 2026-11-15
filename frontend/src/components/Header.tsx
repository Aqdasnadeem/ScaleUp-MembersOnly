"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, X } from "lucide-react";

interface HeaderProps {
  isMobileMenuOpen: boolean;
  onMenuClick: () => void;
  isSidebarCollapsed: boolean;
  onSidebarToggle: () => void;
  isPreview?: boolean;
}

export default function Header({
  isMobileMenuOpen,
  onMenuClick,
  isSidebarCollapsed,
  onSidebarToggle,
  isPreview = false,
}: HeaderProps) {
  const pathname = usePathname();

  const getPageTitle = () => {
    switch (pathname) {
      case "/dashboard":
      case "/demo/dashboard":
        return "";
      case "/":
      case "/analytics/sales":
      case "/analytics/inventory":
      case "/analytics/expenses":
      case "/analytics/feedback":
      case "/forecasting":
      case "/upload":
      case "/history":
      case "/profile":
      case "/agent":
      case "/investigation":
      case "/evidence":
      case "/recommendations":
      case "/anomalies":
      case "/alerts":
      case "/dashboard/reports":
      case "/reports":
      case "/data":
        return "";
      default:
        return "ScaleUp";
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-[#E8DCC8] bg-[#FAF6EF] px-4 shadow-2xs sm:px-6 md:px-8 print:hidden">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
        id="mobile-navigation-toggle"
        aria-controls="primary-navigation"
        aria-expanded={isMobileMenuOpen}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E8DCC8] bg-white text-[#1F2A44] transition-colors hover:bg-[#F6F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#88682A] lg:hidden"
      >
        {isMobileMenuOpen ? (
          <X aria-hidden="true" className="h-5 w-5" />
        ) : (
          <Menu aria-hidden="true" className="h-5 w-5" />
        )}
      </button>
      <button
        type="button"
        onClick={onSidebarToggle}
        aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-controls="primary-navigation"
        aria-expanded={!isSidebarCollapsed}
        className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E8DCC8] bg-white text-[#1F2A44] transition-colors hover:bg-[#F6F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#88682A] lg:inline-flex"
      >
        {isSidebarCollapsed ? <Menu aria-hidden="true" className="h-5 w-5" /> : <X aria-hidden="true" className="h-5 w-5" />}
      </button>

      {/* Page Title (Responsive Truncate) */}
      {getPageTitle() && <div className="min-w-0 flex-1">
        <h1 className="text-base sm:text-lg font-extrabold text-[#1F2A44] tracking-tight truncate">
          {getPageTitle()}
        </h1>
      </div>}

      <div className="flex shrink-0 items-center gap-2.5">
        {/* Anomaly Notification */}
        {isPreview && <Link
          href="/demo/anomalies"
          className="relative p-2 text-[#1F2A44] hover:text-gold-text bg-[#F6F1E8] hover:bg-white rounded-xl transition-all border border-[#E8DCC8]"
          title="Demo alerts"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#C6A75E] ring-2 ring-white" />
        </Link>}

      </div>
    </header>
  );
}
