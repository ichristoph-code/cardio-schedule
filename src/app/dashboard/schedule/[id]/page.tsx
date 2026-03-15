import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { ScheduleViewer } from "@/components/schedule/ScheduleViewer";

export default async function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const isAdmin = (session.user as Record<string, unknown>).role === "ADMIN";

  const schedule = await prisma.schedule.findUnique({
    where: { id },
  });

  if (!schedule) notFound();

  // Non-admin can only view published schedules
  if (!isAdmin && schedule.status !== "PUBLISHED") {
    redirect("/dashboard/schedule");
  }

  const [assignments, physicians, roleTypes] = await Promise.all([
    prisma.scheduleAssignment.findMany({
      where: { scheduleId: id, isActive: true },
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

  // Serialize dates for client component
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
      <ScheduleViewer
        key={schedule.id}
        schedule={{
          id: schedule.id,
          year: schedule.year,
          status: schedule.status,
          generatedAt: schedule.generatedAt?.toISOString() ?? null,
          publishedAt: schedule.publishedAt?.toISOString() ?? null,
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
      />
    </div>
  );
}
