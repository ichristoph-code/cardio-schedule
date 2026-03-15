"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Calendar,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Heart,
  Home,
  Settings,
  Shield,
  Users,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Schedule", href: "/dashboard/schedule", icon: Calendar },
  { label: "My Schedule", href: "/dashboard/my-schedule", icon: CalendarDays },
  { label: "My Preferences", href: "/dashboard/my-preferences", icon: CalendarClock },
  { label: "Requests", href: "/dashboard/requests", icon: ClipboardList },
  { label: "Physicians", href: "/dashboard/physicians", icon: Users, adminOnly: true },
  { label: "Rules", href: "/dashboard/rules", icon: Shield, adminOnly: true },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, adminOnly: true },
];

interface SidebarProps {
  userRole: string;
  onNavigate?: () => void;
}

export function Sidebar({ userRole, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  const filteredItems = navItems.filter(
    (item) => !item.adminOnly || userRole === "ADMIN"
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <Heart className="h-5 w-5 text-red-500" />
          <span className="text-[15px]">CardioSchedule</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200",
                isActive
                  ? "bg-black/[0.06] text-foreground shadow-[0_0.5px_1px_rgba(0,0,0,0.04)] dark:bg-white/[0.1]"
                  : "text-muted-foreground hover:bg-black/[0.03] hover:text-foreground dark:hover:bg-white/[0.06]"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
