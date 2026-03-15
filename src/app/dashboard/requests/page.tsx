import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { RequestsView } from "@/components/requests/RequestsView";

export default async function RequestsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = (session.user as Record<string, unknown>).role === "ADMIN";
  const physicianId = (session.user as Record<string, unknown>).physicianId as
    | string
    | null;

  // Load vacation requests
  const vacationRequests = await prisma.vacationRequest.findMany({
    where: isAdmin ? {} : { physicianId: physicianId ?? undefined },
    include: {
      physician: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Load swap requests
  const swapRequests = await prisma.swapRequest.findMany({
    where: isAdmin
      ? {}
      : {
          OR: [
            { fromPhysicianId: physicianId ?? undefined },
            { toPhysicianId: physicianId ?? undefined },
          ],
        },
    include: {
      fromPhysician: { select: { id: true, firstName: true, lastName: true } },
      toPhysician: { select: { id: true, firstName: true, lastName: true } },
      roleType: { select: { id: true, displayName: true, category: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Load no-call day requests
  const noCallDayRequests = await prisma.noCallDayRequest.findMany({
    where: isAdmin ? {} : { physicianId: physicianId ?? undefined },
    include: {
      physician: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { date: "asc" },
  });

  // Load physicians for swap form
  const physicians = await prisma.physician.findMany({
    select: { id: true, firstName: true, lastName: true },
    orderBy: { lastName: "asc" },
  });

  // Get current physician's upcoming assignments for swap form
  let myAssignments: {
    id: string;
    date: string;
    roleDisplayName: string;
    roleTypeId: string;
  }[] = [];

  if (physicianId) {
    const schedule = await prisma.schedule.findFirst({
      where: { status: { in: ["DRAFT", "PUBLISHED"] } },
      orderBy: { year: "desc" },
    });

    if (schedule) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const assignments = await prisma.scheduleAssignment.findMany({
        where: {
          scheduleId: schedule.id,
          physicianId,
          isActive: true,
          date: { gte: today },
        },
        include: {
          roleType: { select: { id: true, displayName: true } },
        },
        orderBy: { date: "asc" },
        take: 60,
      });

      myAssignments = assignments.map((a) => ({
        id: a.id,
        date: a.date.toISOString().split("T")[0],
        roleDisplayName: a.roleType.displayName,
        roleTypeId: a.roleType.id,
      }));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Requests</h1>
        <p className="text-muted-foreground">
          {isAdmin
            ? "Review and manage vacation, no-call day, and swap requests."
            : "Submit vacation requests, no-call day preferences, and propose shift swaps."}
        </p>
      </div>

      <RequestsView
        isAdmin={isAdmin}
        physicianId={physicianId}
        vacationRequests={vacationRequests.map((v) => ({
          id: v.id,
          physicianId: v.physicianId,
          physicianName: `${v.physician.firstName} ${v.physician.lastName}`,
          startDate: v.startDate.toISOString().split("T")[0],
          endDate: v.endDate.toISOString().split("T")[0],
          reason: v.reason,
          status: v.status,
          reviewNote: v.reviewNote,
          createdAt: v.createdAt.toISOString(),
        }))}
        swapRequests={swapRequests.map((s) => ({
          id: s.id,
          fromPhysicianId: s.fromPhysicianId,
          fromPhysicianName: `${s.fromPhysician.firstName} ${s.fromPhysician.lastName}`,
          toPhysicianId: s.toPhysicianId,
          toPhysicianName: `${s.toPhysician.firstName} ${s.toPhysician.lastName}`,
          date: s.date.toISOString().split("T")[0],
          roleDisplayName: s.roleType.displayName,
          roleTypeId: s.roleTypeId,
          status: s.status,
          peerAccepted: s.peerAccepted,
          reviewNote: s.reviewNote,
          createdAt: s.createdAt.toISOString(),
        }))}
        noCallDayRequests={noCallDayRequests.map((nc) => ({
          id: nc.id,
          physicianId: nc.physicianId,
          physicianName: `${nc.physician.firstName} ${nc.physician.lastName}`,
          date: nc.date.toISOString().split("T")[0],
          reason: nc.reason,
          status: nc.status,
          reviewNote: nc.reviewNote,
          createdAt: nc.createdAt.toISOString(),
        }))}
        physicians={physicians}
        myAssignments={myAssignments}
      />
    </div>
  );
}
