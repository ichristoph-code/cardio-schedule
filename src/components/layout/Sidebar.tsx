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
  /** What a physician sees, where it differs — "My …" rather than "Physician …". */
  physicianLabel?: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  /** Pages an admin account has no use for — they carry no personal schedule. */
  physicianOnly?: boolean;
  /**
   * Parked: hidden from physicians entirely, and shown to admins greyed out and
   * unclickable — present so an admin can see the section still exists, without
   * it reading as part of the current workflow. The pages themselves are
   * untouched and still reachable by URL.
   */
  parked?: boolean;
}

// A physician sees exactly these four, in this order: the calendars they use
// day to day first, and the standing preferences they rarely touch last. An
// admin sees only the two that aren't personal.
const navItems: NavItem[] = [
  { label: "Physician Vacation & Work Calendar", physicianLabel: "My Vacation & Work Calendar", href: "/dashboard/vacation", icon: Palmtree },
  { label: "My Task Calendar", href: "/dashboard/my-schedule", icon: CalendarDays, physicianOnly: true },
  { label: "Group Schedule", href: "/dashboard/schedule", icon: Calendar },
  { label: "My Preferences", href: "/dashboard/my-preferences", icon: CalendarClock, physicianOnly: true },

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
  const visible = navItems.filter((item) =>
    isAdmin ? !item.physicianOnly : !item.adminOnly && !item.parked
  );
  // Working items first; parked ones (admins only) grouped under a caption at
  // the bottom, so it is obvious where "works" ends and "paused" begins.
  const activeItems = visible.filter((item) => !item.parked);
  const navLabel = (item: NavItem) => (!isAdmin && item.physicianLabel) || item.label;
  const parkedItems = visible.filter((item) => item.parked);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <Heart className="h-5 w-5 text-rose-500" />
          <span className="text-[15px]">CardioSchedule</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {activeItems.map((item) => {
          const Icon = item.icon;
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
              {navLabel(item)}
            </Link>
          );
        })}

        {parkedItems.length > 0 && (
          <div className="pt-4">
            <p className="px-3 pb-1 text-[11px] leading-snug text-muted-foreground/60">
              Greyed out: paused until the initial rollout is complete.
            </p>
            {parkedItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.href}
                  aria-disabled="true"
                  title="Paused until the initial rollout is complete"
                  className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-muted-foreground/40"
                >
                  <Icon className="h-4 w-4" />
                  {navLabel(item)}
                </div>
              );
            })}
          </div>
        )}
      </nav>
    </div>
  );
}
