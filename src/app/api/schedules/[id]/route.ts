import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// GET /api/schedules/[id] — get schedule with all assignments
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: {
      assignments: {
        where: { isActive: true },
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
      },
    },
  });

  if (!schedule) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Also return all physicians and role types for the UI
  const [physicians, roleTypes] = await Promise.all([
    prisma.physician.findMany({
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: "asc" },
    }),
    prisma.roleType.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return NextResponse.json({ schedule, physicians, roleTypes });
}

// PATCH /api/schedules/[id] — update status (publish/archive)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as Record<string, unknown>).role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await params;
  const { status } = await req.json();

  if (!["PUBLISHED", "ARCHIVED", "DRAFT"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = { status };
  if (status === "PUBLISHED") {
    updateData.publishedAt = new Date();
    updateData.publishedBy = session.user.id;
  }

  const schedule = await prisma.schedule.update({
    where: { id },
    data: updateData,
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    status === "PUBLISHED" ? "PUBLISH_SCHEDULE" : "UPDATE_SCHEDULE_STATUS",
    "Schedule",
    id,
    { newStatus: status, year: schedule.year }
  );

  return NextResponse.json(schedule);
}
