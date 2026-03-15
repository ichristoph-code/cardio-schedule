import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ScheduleManager } from "@/components/schedule/ScheduleManager";

export default async function SchedulePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = (session.user as Record<string, unknown>).role === "ADMIN";

  const schedules = await prisma.schedule.findMany({
    orderBy: { year: "desc" },
    include: { _count: { select: { assignments: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Schedules</h1>
        <p className="text-muted-foreground">
          {isAdmin
            ? "Generate, view, and publish yearly schedules."
            : "View published schedules."}
        </p>
      </div>

      <ScheduleManager
        schedules={schedules.map((s) => ({
          id: s.id,
          year: s.year,
          status: s.status,
          generatedAt: s.generatedAt?.toISOString() ?? null,
          publishedAt: s.publishedAt?.toISOString() ?? null,
          assignmentCount: s._count.assignments,
        }))}
        isAdmin={isAdmin}
      />
    </div>
  );
}
