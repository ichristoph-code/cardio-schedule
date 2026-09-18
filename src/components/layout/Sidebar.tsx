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
  Palmtree,
  Settings,
  Shield,
  Users,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  /**
   * Parked: hidden from physicians entirely, and shown to admins greyed out and
   * unclickable — present so an admin can see the section still exists, without
   * it reading as part of the current workflow. The pages themselves are
   * untouched and still reachable by URL.
   */
  parked?: boolean;
}

// A physician sees exactly these four, in this order: what they fill in first at
// the top, the group view they only read at the bottom.
const navItems: NavItem[] = [
  { label: "Call and Vacation Preferences", href: "/dashboard/my-preferences", icon: CalendarClock },
  { label: "Personal Task Calendar", href: "/dashboard/my-schedule", icon: CalendarDays },
  { label: "Physician Vacation & Work Calendar", href: "/dashboard/vacation", icon: Palmtree },
  { label: "Group Schedule", href: "/dashboard/schedule", icon: Calendar },

  // Admin-only below.
  { label: "Physicians/Users", href: "/dashboard/physicians", icon: Users, adminOnly: true },
  { label: "Rules", href: "/dashboard/rules", icon: Shield, adminOnly: true },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, adminOnly: true },

  // Parked — see `parked` above.
  { label: "Requests", href: "/dashboard/requests", icon: ClipboardList, parked: true },
  { label: "Dashboard", href: "/dashboard", icon: Home, parked: true },
];

interface SidebarProps {
  userRole: string;
  onNavigate?: () => void;
}

export function Sidebar({ userRole, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  const isAdmin = userRole === "ADMIN";
  // Parked items are admin-visible too — greyed out below rather than linked.
  const filteredItems = navItems.filter(
    (item) => (!item.adminOnly && !item.parked) || isAdmin
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <Heart className="h-5 w-5 text-rose-500" />
          <span className="text-[15px]">CardioSchedule</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {filteredItems.map((item) => {
          const Icon = item.icon;

          if (item.parked) {
            return (
              <div
                key={item.href}
                aria-disabled="true"
                title="Not in use"
                className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-muted-foreground/40"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </div>
            );
          }

          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary shadow-[0_0.5px_2px_rgba(0,0,0,0.04)] dark:bg-primary/15 dark:text-primary"
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
