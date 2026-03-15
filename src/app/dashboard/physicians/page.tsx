import { prisma } from "@/lib/prisma";
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
import { Plus, Pencil } from "lucide-react";
import { AddPhysicianDialog } from "@/components/physicians/AddPhysicianDialog";
import { DeletePhysicianButton } from "@/components/physicians/DeletePhysicianButton";
import { CallStatsYearSelect } from "@/components/physicians/CallStatsYearSelect";

export default async function PhysiciansPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;

  const physicians = await prisma.physician.findMany({
    include: {
      user: { select: { email: true } },
      eligibilities: { include: { roleType: true } },
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

    for (const a of onCallAssignments) {
      const date = new Date(a.date);
      const dow = date.getUTCDay(); // 0=Sun, 1=Mon ... 5=Fri, 6=Sat (UTC to avoid TZ offset)

      if (!callStatsMap.has(a.physicianId)) {
        callStatsMap.set(a.physicianId, { weekdays: 0, weekends: 0 });
      }
      const stats = callStatsMap.get(a.physicianId)!;

      // Weekday call (Mon-Fri) — General Call only (excludes EP and Interventional)
      if (dow >= 1 && dow <= 5 && a.roleType.name === "GENERAL_CALL") {
        stats.weekdays++;
      }

      // Weekend blocks - count only Fridays (each Fri = 1 weekend block covering Fri-Sat-Sun)
      if (dow === 5) {
        stats.weekends++;
      }
    }
  }

  const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead className="hidden md:table-cell">FTE</TableHead>
              <TableHead className="hidden md:table-cell">Subspecialty</TableHead>
              <TableHead className="hidden lg:table-cell">Office Days</TableHead>
              <TableHead className="hidden lg:table-cell">Eligible Roles</TableHead>
              <TableHead className="hidden xl:table-cell">
                <div className="flex flex-col items-center gap-1">
                  <span>Weekday Call</span>
                  {availableYears.length > 0 && (
                    <CallStatsYearSelect
                      years={availableYears}
                      selectedYear={selectedYear}
                    />
                  )}
                </div>
              </TableHead>
              <TableHead className="hidden xl:table-cell">
                <div className="flex flex-col items-center gap-1">
                  <span>Weekends</span>
                  {availableYears.length > 0 && (
                    <CallStatsYearSelect
                      years={availableYears}
                      selectedYear={selectedYear}
                    />
                  )}
                </div>
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {physicians.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  No physicians added yet. Click &quot;Add Physician&quot; to get started.
                </TableCell>
              </TableRow>
            ) : (
              physicians.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    {doc.lastName}, {doc.firstName}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {doc.user.email}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {doc.fteDays}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex gap-1">
                      {doc.isInterventionalist && (
                        <Badge variant="secondary">Interventional</Badge>
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
                    <div className="flex gap-1">
                      {doc.officeDays
                        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                        .map((d) => (
                          <Badge key={d.id} variant="outline" className="text-xs">
                            {dayNames[d.dayOfWeek]}
                          </Badge>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {doc.eligibilities.length} roles
                    </span>
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
                        <span className="text-sm font-medium">{stats.weekends}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Link href={`/dashboard/physicians/${doc.id}`}>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <DeletePhysicianButton
                        physicianId={doc.id}
                        physicianName={`${doc.firstName} ${doc.lastName}`}
                      />
                    </div>
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
