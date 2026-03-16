import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Mail,
  Phone,
  Briefcase,
  Clock,
  Activity,
  Stethoscope,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";

interface Props {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  fteDays: number;
  subspecialties: string[];
  officeDays: string[];
  eligibleRoles: string[];
  totalEligibleRoles: number;
  assignmentCount: number;
  callCount: number;
  scheduleYear: number;
  physicianId: string;
}

export function PhysicianProfileHeader({
  firstName,
  lastName,
  email,
  phone,
  fteDays,
  subspecialties,
  officeDays,
  eligibleRoles,
  totalEligibleRoles,
  assignmentCount,
  callCount,
  scheduleYear,
  physicianId,
}: Props) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  const ftePercent = Math.round((fteDays / 200) * 100);

  return (
    <div className="space-y-4">
      {/* Back button */}
      <Link href="/dashboard/physicians">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          All Physicians
        </Button>
      </Link>

      {/* Main profile card */}
      <div className="rounded-2xl border bg-gradient-to-br from-white via-white to-primary/[0.03] dark:from-background dark:via-background dark:to-primary/[0.06] p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-5">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-primary/20">
              {initials}
            </div>
          </div>

          {/* Name + details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Dr. {firstName} {lastName}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {subspecialties.map((s) => (
                    <Badge
                      key={s}
                      variant="secondary"
                      className="bg-primary/10 text-primary border-primary/20 font-medium"
                    >
                      <Stethoscope className="w-3 h-3 mr-1" />
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
              <Link href={`/dashboard/physicians/${physicianId}/calendar`}>
                <Button variant="outline" size="sm" className="gap-1.5 rounded-lg">
                  <Calendar className="h-4 w-4" />
                  View Calendar
                </Button>
              </Link>
            </div>

            {/* Contact + quick info row */}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {email}
              </span>
              {phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {phone}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" />
                {fteDays} FTE days ({ftePercent}%)
              </span>
              {officeDays.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Office: {officeDays.join(", ")}
                </span>
              )}
            </div>

            {/* Eligible roles */}
            {eligibleRoles.length > 0 && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground mr-1">Eligible:</span>
                {eligibleRoles.map((role) => (
                  <Badge key={role} variant="outline" className="text-[11px] py-0">
                    {role}
                  </Badge>
                ))}
                {totalEligibleRoles > eligibleRoles.length && (
                  <span className="text-[11px] text-muted-foreground">
                    +{totalEligibleRoles - eligibleRoles.length} more
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-border/50">
          <div className="rounded-xl bg-primary/5 dark:bg-primary/10 p-3 text-center">
            <div className="text-2xl font-bold tabular-nums text-primary">{assignmentCount}</div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mt-0.5">
              {scheduleYear} Assignments
            </div>
          </div>
          <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-center">
            <div className="text-2xl font-bold tabular-nums text-red-500">{callCount}</div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mt-0.5">
              Call Duties
            </div>
          </div>
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
            <div className="text-2xl font-bold tabular-nums text-emerald-600">{totalEligibleRoles}</div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mt-0.5">
              Eligible Roles
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
