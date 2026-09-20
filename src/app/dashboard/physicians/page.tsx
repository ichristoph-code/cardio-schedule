import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Calendar } from "lucide-react";
import { AddPhysicianDialog } from "@/components/physicians/AddPhysicianDialog";
import { DeletePhysicianButton } from "@/components/physicians/DeletePhysicianButton";
import { CallStatsYearSelect } from "@/components/physicians/CallStatsYearSelect";
import { ActivityRoleSelect } from "@/components/physicians/ActivityRoleSelect";

export default async function PhysiciansPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; actRole?: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const params = await searchParams;

  const physicians = await prisma.physician.findMany({
    include: {
      user: { select: { email: true } },
      officeDays: true,
    },
    orderBy: { lastName: "asc" },
  });

  // --- Call statistics: weekday call days + weekend blocks ---
  // Get all available schedule years for the dropdown
  const allSchedules = await prisma.schedule.findMany({
    select: { id: true, year: true },
    orderBy: { year: "desc" },
  });
  const availableYears = allSchedules.map((s) => s.year);
  const currentYear = new Date().getFullYear();

  // Selected year from URL param, falling back to current year
  const selectedYear = params.year
    ? parseInt(params.year, 10)
    : currentYear;

  // All role types for activity dropdown
  const allRoleTypes = await prisma.roleType.findMany({
    select: { name: true, displayName: true, category: true },
    orderBy: { sortOrder: "asc" },
  });

  const defaultActivityRole = allRoleTypes.find((r) => r.category === "READING")?.name
    ?? allRoleTypes[0]?.name
    ?? "";
  const selectedActivityRole = params.actRole ?? defaultActivityRole;

  // Find the schedule for the selected year
  const schedule = allSchedules.find((s) => s.year === selectedYear);

  const callStatsMap = new Map<string, { weekdays: number; weekends: number }>();

  if (schedule) {
    // Fetch all active ON_CALL assignments for this year's schedule
    const onCallAssignments = await prisma.scheduleAssignment.findMany({
      where: {
        scheduleId: schedule.id,
        isActive: true,
        roleType: { category: "ON_CALL" },
      },
      select: {
        physicianId: true,
        date: true,
        roleType: { select: { name: true } },
      },
    });

    // A weekend on-call block is Fri-Sat-Sun covered by one MD. The scheduler
    // writes a GENERAL_CALL row on each of Fri/Sat/Sun; the editor may set call
    // on any single day. Count each weekend once by collapsing every Fri/Sat/Sun
    // general call to that weekend's Friday — so a scheduler block isn't counted
    // 3x, and a manually-set Sat/Sun call (no Friday row) still registers.
    const raw = new Map<string, { weekdays: number; weekendFridays: Set<string> }>();
    for (const a of onCallAssignments) {
      if (a.roleType.name !== "GENERAL_CALL") continue;
      const date = new Date(a.date);
      const dow = date.getUTCDay(); // 0=Sun, 1=Mon ... 5=Fri, 6=Sat (UTC to avoid TZ offset)

      if (!raw.has(a.physicianId)) {
        raw.set(a.physicianId, { weekdays: 0, weekendFridays: new Set() });
      }
      const stats = raw.get(a.physicianId)!;

      // Weekday general call (Mon-Fri)
      if (dow >= 1 && dow <= 5) {
        stats.weekdays++;
      }

      // Weekend block — any general call on Fri/Sat/Sun, keyed by that weekend's
      // Friday so Fri+Sat+Sun (or a lone Sat/Sun) counts exactly once.
      if (dow === 5 || dow === 6 || dow === 0) {
        const friday = new Date(date);
        friday.setUTCDate(friday.getUTCDate() - (dow === 5 ? 0 : dow === 6 ? 1 : 2));
        stats.weekendFridays.add(friday.toISOString().split("T")[0]);
      }
    }
    for (const [pid, s] of raw) {
      callStatsMap.set(pid, { weekdays: s.weekdays, weekends: s.weekendFridays.size });
    }
  }

  // Activity stats: count assignments for selected role type
  const activityCountMap = new Map<string, number>();

  if (schedule && selectedActivityRole) {
    const activityAssignments = await prisma.scheduleAssignment.findMany({
      where: {
        scheduleId: schedule.id,
        isActive: true,
        roleType: { name: selectedActivityRole },
      },
      select: { physicianId: true },
    });

    for (const a of activityAssignments) {
      activityCountMap.set(a.physicianId, (activityCountMap.get(a.physicianId) ?? 0) + 1);
    }
  }

  const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

  // Normalize a raw tally to the physician's FTE (assignments per FTE-day),
  // so workload is comparable across full- and part-time physicians.
  const perFte = (count: number, fteDays: number): string =>
    fteDays > 0 ? (count / fteDays).toFixed(3) : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Physicians</h1>
          <p className="text-muted-foreground">
            Manage physician profiles, role eligibility, and office schedules.
          </p>
        </div>
        <AddPhysicianDialog />
      </div>

      <div className="space-y-3">
        <div className="hidden xl:flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {availableYears.length > 0 && <div className="flex items-center gap-2">
            <span>Workload year</span>
            <CallStatsYearSelect years={availableYears} selectedYear={selectedYear} />
          </div>}
          <div className="flex items-center gap-2">
            <span>Activity</span>
            <ActivityRoleSelect roles={allRoleTypes} selectedRole={selectedActivityRole} />
          </div>
        </div>
        <Table className="table-fixed [&_th]:px-2 [&_th]:normal-case [&_th]:tracking-normal [&_td]:px-2 [&_td]:py-2">
          <TableHeader>
            <TableRow>
              <TableHead className="w-36 sticky left-0 z-10 bg-background border-r">Name</TableHead>
              <TableHead className="hidden md:table-cell w-11 text-center">FTE</TableHead>
              <TableHead className="hidden md:table-cell w-[104px]">Subspecialty</TableHead>
              <TableHead className="hidden lg:table-cell w-[100px] whitespace-normal">Office Days</TableHead>
              <TableHead className="hidden xl:table-cell w-16 whitespace-normal text-center py-2" title="Weekday General Call">Weekday Call</TableHead>
              <TableHead className="hidden xl:table-cell w-[60px] whitespace-normal text-center" title="Weekday General Call per FTE">Weekday / FTE</TableHead>
              <TableHead className="hidden xl:table-cell w-16 whitespace-normal text-center" title="Weekend General Call">Weekend Call</TableHead>
              <TableHead className="hidden xl:table-cell w-[60px] whitespace-normal text-center" title="Weekend General Call per FTE">Weekend / FTE</TableHead>
              <TableHead className="hidden xl:table-cell w-16 whitespace-normal text-center">Activity Count</TableHead>
              <TableHead className="hidden xl:table-cell w-[60px] whitespace-normal text-center">Activity / FTE</TableHead>
              <TableHead className="w-[104px]"><span className="sr-only">Actions</span></TableHead>
              <TableHead className="hidden sm:table-cell w-[168px]">Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {physicians.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="h-24 text-center text-muted-foreground">
                  No physicians added yet. Click &quot;Add User&quot; to get started.
                </TableCell>
              </TableRow>
            ) : (
              physicians.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium whitespace-normal break-words sticky left-0 z-10 bg-background border-r">
                    {doc.lastName}, {doc.firstName}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-center tabular-nums">
                    {doc.fteDays}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {doc.isInterventionalist && (
                        <Badge variant="secondary" className="px-1 text-[11px]">Interventional</Badge>
                      )}
                      {doc.isEP && (
                        <Badge variant="secondary">EP</Badge>
                      )}
                      {!doc.isInterventionalist && !doc.isEP && (
                        <span className="text-muted-foreground text-sm">General</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {doc.officeDays
                        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                        .map((d) => (
                          <Badge key={d.id} variant="outline" className="text-xs">
                            {dayNames[d.dayOfWeek]}
                          </Badge>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-center">
                    {(() => {
                      const stats = callStatsMap.get(doc.id);
                      return stats ? (
                        <span className="text-sm font-medium">{stats.weekdays}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-center">
                    {(() => {
                      const stats = callStatsMap.get(doc.id);
                      return stats ? (
                        <span className="text-sm text-muted-foreground">{perFte(stats.weekdays, doc.fteDays)}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-center">
                    {(() => {
                      const stats = callStatsMap.get(doc.id);
                      return stats ? (
                        <span className="text-sm font-medium">{stats.weekends}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-center">
                    {(() => {
                      const stats = callStatsMap.get(doc.id);
                      return stats ? (
                        <span className="text-sm text-muted-foreground">{perFte(stats.weekends, doc.fteDays)}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-center">
                    {(() => {
                      const count = activityCountMap.get(doc.id);
                      return count !== undefined ? (
                        <span className="text-sm font-medium">{count}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-center">
                    {(() => {
                      const count = activityCountMap.get(doc.id);
                      return count !== undefined ? (
                        <span className="text-sm text-muted-foreground">{perFte(count, doc.fteDays)}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Link href={`/dashboard/physicians/${doc.id}/calendar`}>
                        <Button variant="ghost" size="icon-sm" aria-label={`Calendar for ${doc.firstName} ${doc.lastName}`}>
                          <Calendar className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link href={`/dashboard/physicians/${doc.id}`}>
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${doc.firstName} ${doc.lastName}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <DeletePhysicianButton
                        physicianId={doc.id}
                        physicianName={`${doc.firstName} ${doc.lastName}`}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    <a href={`mailto:${doc.user.email}`} title={doc.user.email} className="block truncate text-xs hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                      {doc.user.email}
                    </a>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
