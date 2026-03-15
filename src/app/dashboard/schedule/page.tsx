import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ScheduleViewer } from "@/components/schedule/ScheduleViewer";
import { ScheduleGenerateButton } from "@/components/schedule/ScheduleGenerateButton";
import { Calendar } from "lucide-react";

export default async function SchedulePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = (session.user as Record<string, unknown>).role === "ADMIN";

  // Find the latest schedule (admin sees any, physician sees published only)
  const latestSchedule = await prisma.schedule.findFirst({
    where: isAdmin ? {} : { status: "PUBLISHED" },
    orderBy: { year: "desc" },
  });

  // No schedule exists — show empty state with generate button
  if (!latestSchedule) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
            <p className="text-muted-foreground">
              {isAdmin
                ? "Generate, view, and publish yearly schedules."
                : "View published schedules."}
            </p>
          </div>
          {isAdmin && <ScheduleGenerateButton />}
        </div>

        <div className="py-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">No schedules yet</h3>
          <p className="text-muted-foreground">
            {isAdmin
              ? "Click \"Generate Schedule\" to create your first schedule."
              : "No schedules have been published yet. Check back later."}
          </p>
        </div>
      </div>
    );
  }

  // Load full data for the latest schedule
  const [assignments, physicians, roleTypes] = await Promise.all([
    prisma.scheduleAssignment.findMany({
      where: { scheduleId: latestSchedule.id, isActive: true },
      include: {
        physician: { select: { id: true, firstName: true, lastName: true } },
        roleType: {
          select: {
            id: true,
            name: true,
            displayName: true,
            category: true,
            sortOrder: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { roleType: { sortOrder: "asc" } }],
    }),
    prisma.physician.findMany({
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: "asc" },
    }),
    prisma.roleType.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const serializedAssignments = assignments.map((a) => ({
    id: a.id,
    date: a.date.toISOString().split("T")[0],
    physicianId: a.physician.id,
    physicianName: `${a.physician.firstName} ${a.physician.lastName}`,
    physicianLastName: a.physician.lastName,
    roleTypeId: a.roleType.id,
    roleName: a.roleType.name,
    roleDisplayName: a.roleType.displayName,
    roleCategory: a.roleType.category,
    roleSortOrder: a.roleType.sortOrder,
    source: a.source,
  }));

  return (
    <div className="space-y-4">
      {/* Admin toolbar — generate button sits above the calendar */}
      {isAdmin && (
        <div className="flex justify-end">
          <ScheduleGenerateButton />
        </div>
      )}

      <ScheduleViewer
        schedule={{
          id: latestSchedule.id,
          year: latestSchedule.year,
          status: latestSchedule.status,
          generatedAt: latestSchedule.generatedAt?.toISOString() ?? null,
          publishedAt: latestSchedule.publishedAt?.toISOString() ?? null,
        }}
        assignments={serializedAssignments}
        physicians={physicians}
        roleTypes={roleTypes.map((r) => ({
          id: r.id,
          name: r.name,
          displayName: r.displayName,
          category: r.category,
          sortOrder: r.sortOrder,
        }))}
        isAdmin={isAdmin}
        showBackButton={false}
      />
    </div>
  );
}
