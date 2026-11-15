"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BotMessageSquare,
  UploadCloud,
  LogOut,
  History,
  UserRound,
  TriangleAlert,
  Lightbulb,
  Database,
  BarChart3,
  PackageCheck,
  FileText,
  TrendingUp,
  MessageSquareText,
  Search,
} from "lucide-react";
import ScaleUpLogo from "@/components/ScaleUpLogo";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";
import { resetBusiness, useBusiness } from "@/hooks/useBusiness";
import type { LucideIcon } from "lucide-react";

interface SidebarProps {
  isMobileOpen: boolean;
  isCollapsed: boolean;
  onNavigate: () => void;
  businessName: string;
  isDemo: boolean;
  isPreview?: boolean;
}

interface NavGroup {
  groupName: string;
  items: {
    name: string;
    href: string;
    icon: LucideIcon;
    badge?: string;
    planned?: boolean;
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    groupName: "Your business",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Upload data", href: "/upload", icon: UploadCloud },
      { name: "Ask the assistant", href: "/agent", icon: BotMessageSquare, planned: true },
      { name: "History", href: "/history", icon: History },
      { name: "Profile", href: "/profile", icon: UserRound },
    ],
  },
  {
    groupName: "Insights",
    items: [
      { name: "Alerts", href: "/anomalies", icon: TriangleAlert, planned: true },
      { name: "Recommendations", href: "/recommendations", icon: Lightbulb, planned: true },
      { name: "Evidence", href: "/evidence", icon: Database },
      { name: "Investigation", href: "/investigation", icon: Search, planned: true },
      { name: "Sales and revenue", href: "/analytics/sales", icon: TrendingUp },
      { name: "Inventory", href: "/analytics/inventory", icon: PackageCheck },
      { name: "Expenses", href: "/analytics/expenses", icon: BarChart3 },
      { name: "Customer reviews", href: "/analytics/feedback", icon: MessageSquareText },
      { name: "Forecasting", href: "/forecasting", icon: TrendingUp, planned: true },
      { name: "Business reports", href: "/dashboard/reports", icon: FileText, planned: true },
    ],
  },
];

export default function Sidebar({ isMobileOpen, isCollapsed, onNavigate, businessName: fallbackName, isPreview = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { business } = useBusiness(!isPreview);
  const businessName = business?.business_name ?? fallbackName;

  const initials = businessName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase() ?? "")
    .join("") || "BU";
  const navigationHref = (href: string) => {
    if (!isPreview) return href;
    if (href === "/profile") return "/demo/dashboard";
    return `/demo${href}`;
  };
  const activePath = pathname.startsWith("/demo/") ? pathname.slice("/demo".length) : pathname;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex h-screen w-72 shrink-0 flex-col overflow-hidden border-r border-[#C6A75E]/30 bg-[#1F2A44] text-[#E8DCC8] shadow-2xl transition-all duration-200 lg:sticky lg:top-0 lg:z-20 ${isCollapsed ? "lg:w-20" : "lg:w-72"} lg:translate-x-0 print:hidden ${
        isMobileOpen ? "translate-x-0" : "-translate-x-full max-lg:invisible max-lg:pointer-events-none"
      }`}
    >
      {/* Brand Header */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className={`border-b border-[#2D3D60] bg-[#131A2B]/70 ${isCollapsed ? "p-3" : "px-4 py-3"}`}>
          <Link href="/" onClick={onNavigate} className={`flex items-center gap-3 group ${isCollapsed ? "lg:justify-center" : ""}`}>
            <ScaleUpLogo size="md" preload />
            {!isCollapsed && (
              <span className="font-extrabold text-lg text-white tracking-wide">ScaleUp</span>
            )}
          </Link>
        </div>

        {/* Navigation Sections */}
        <nav id="primary-navigation" aria-label="Primary navigation" className="sidebar-navigation min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.groupName} className="space-y-0.5">
              {!isCollapsed && <p className="px-3 py-1 text-[11px] font-bold tracking-widest uppercase text-[#E0C788]">
                {group.groupName}
              </p>}
              {group.items.map((item) => {
                const isActive = activePath === item.href
                  || activePath.startsWith(`${item.href}/`)
                  || (item.href === "/anomalies" && activePath === "/alerts");
                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    href={navigationHref(item.href)}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={isCollapsed ? item.name : undefined}
                    title={isCollapsed ? item.name : undefined}
                    className={`flex min-h-8 items-center justify-between rounded-lg px-3 py-1.5 text-[13px] leading-4 font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0C788] ${
                      isCollapsed ? "lg:justify-center lg:px-2" : ""} ${
                      isActive
                        ? "bg-[#C6A75E] text-[#1F2A44] font-bold shadow-sm shadow-[#C6A75E]/30"
                        : "text-[#E8DCC8] hover:text-white hover:bg-[#2B3A5E]"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isActive ? "text-[#1F2A44]" : "text-[#C6A75E]"
                        }`}
                      />
                      {!isCollapsed && <span className="truncate">{item.name}</span>}
                    </div>

                    {item.planned && !isPreview && !isCollapsed && (
                      <span className="shrink-0 rounded-full border border-[#C6A75E]/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#E0C788]">
                        Planned (FYP-2)
                      </span>
                    )}
                    {item.badge && !isCollapsed && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          isActive
                            ? "bg-[#1F2A44] text-[#E8DCC8]"
                            : item.badge === "Demo"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            : "bg-[#131A2B] text-[#C6A75E] border border-[#C6A75E]/40"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Footer User Profile & Logout */}
      <div className={`relative z-10 shrink-0 border-t border-[#2D3D60] bg-[#131A2B] ${isCollapsed ? "p-2 lg:p-2" : "p-4"}`}>
        {null}
        <div className={`flex ${isCollapsed ? "flex-col items-center gap-1" : "items-center justify-between gap-2 px-1"}`}>
          <Link
            href={navigationHref("/profile")}
            onClick={onNavigate}
            className={`flex min-w-0 items-center gap-2.5 overflow-hidden rounded-lg p-1 hover:bg-[#2B3A5E] ${isCollapsed ? "h-10 w-10 shrink-0 justify-center p-0 lg:justify-center" : "flex-1"}`}
            aria-label="Open profile"
          >
            <div className="w-8 h-8 shrink-0 rounded-full bg-[#C6A75E] flex items-center justify-center font-bold text-xs text-[#1F2A44] shadow-sm">
              {initials}
            </div>
            {!isCollapsed && <div className="min-w-0 overflow-hidden leading-4">
              <p className="truncate text-xs font-semibold text-[#E8DCC8]">Business User</p>
              <p className="truncate text-[11px] text-[#E0C788]">{businessName}</p>
            </div>}
          </Link>

          {isPreview ? (
            <Link
              href="/login"
              onClick={onNavigate}
              title="Leave demo preview"
              aria-label="Leave demo preview"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg p-1.5 text-[#E8DCC8]/80 transition-colors hover:bg-[#2B3A5E] hover:text-white"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                clearToken();
                resetBusiness();
                onNavigate();
                router.replace("/login");
              }}
              title="Sign out"
              aria-label="Sign out"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg p-1.5 text-[#E8DCC8]/60 transition-colors hover:bg-[#2B3A5E] hover:text-[#C6A75E] disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
