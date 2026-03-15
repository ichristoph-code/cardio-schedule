import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar, ClipboardList, Heart } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  const isAdmin = (session?.user as Record<string, unknown>)?.role === "ADMIN";
  const physicianId = (session?.user as Record<string, unknown>)
    ?.physicianId as string | null;

  // Fetch dashboard data in parallel
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    pendingVacations,
    pendingSwaps,
    pendingNoCallDays,
    latestSchedule,
    todayCoverage,
    myNextAssignment,
  ] = await Promise.all([
    // Pending vacation requests (admin sees all, physician sees own)
    prisma.vacationRequest.count({
      where: {
        status: "PENDING",
        ...(isAdmin ? {} : { physicianId: physicianId ?? undefined }),
      },
    }),
    // Pending swap requests
    prisma.swapRequest.count({
      where: {
        status: "PENDING",
        ...(isAdmin
          ? { peerAccepted: true } // Admin cares about peer-accepted swaps
          : {
              OR: [
                { fromPhysicianId: physicianId ?? undefined },
                { toPhysicianId: physicianId ?? undefined },
              ],
            }),
      },
    }),
    // Pending no-call day requests
    prisma.noCallDayRequest.count({
      where: {
        status: "PENDING",
        ...(isAdmin ? {} : { physicianId: physicianId ?? undefined }),
      },
    }),
    // Latest schedule
    prisma.schedule.findFirst({
      orderBy: { year: "desc" },
      select: { id: true, year: true, status: true },
    }),
    // Today's coverage count
    prisma.scheduleAssignment.count({
      where: {
        date: today,
        isActive: true,
      },
    }),
    // Physician's next assignment
    physicianId
      ? prisma.scheduleAssignment.findFirst({
          where: {
            physicianId,
            isActive: true,
            date: { gte: today },
          },
          include: {
            roleType: { select: { displayName: true } },
          },
          orderBy: { date: "asc" },
        })
      : null,
  ]);

  const totalPending = pendingVacations + pendingSwaps + pendingNoCallDays;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome, {session?.user?.name?.split(" ")[0] ?? "Doctor"}
        </h1>
        <p className="text-muted-foreground">
          {isAdmin
            ? "Manage schedules, physicians, and requests."
            : "View your schedule and submit requests."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Today&apos;s Coverage
            </CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayCoverage}</div>
            <p className="text-xs text-muted-foreground">
              {todayCoverage === 0
                ? "No assignments today"
                : `Role${todayCoverage !== 1 ? "s" : ""} filled today`}
            </p>
          </CardContent>
        </Card>

        <Link href="/dashboard/requests">
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Pending Requests
              </CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPending}</div>
              <p className="text-xs text-muted-foreground">
                {totalPending === 0
                  ? "All caught up"
                  : [
                      pendingVacations > 0 && `${pendingVacations} vacation`,
                      pendingNoCallDays > 0 && `${pendingNoCallDays} no-call`,
                      pendingSwaps > 0 && `${pendingSwaps} swap`,
                    ]
                      .filter(Boolean)
                      .join(", ")}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Current Schedule
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {latestSchedule?.year ?? new Date().getFullYear()}
            </div>
            <p className="text-xs text-muted-foreground">
              {latestSchedule
                ? latestSchedule.status === "PUBLISHED"
                  ? "Published"
                  : latestSchedule.status === "DRAFT"
                  ? "Draft — awaiting publish"
                  : "Archived"
                : "No schedule generated"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Next assignment for physicians */}
      {!isAdmin && myNextAssignment && (
        <Card>
          <CardHeader>
            <CardTitle>Your Next Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {myNextAssignment.roleType.displayName}
                </div>
                <div className="text-sm text-muted-foreground">
                  {new Date(myNextAssignment.date).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>
              Set up your practice in a few steps
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">
                  Review physician profiles
                </strong>{" "}
                &mdash; Go to{" "}
                <Link
                  href="/dashboard/physicians"
                  className="underline text-foreground"
                >
                  Physicians
                </Link>{" "}
                to set up role eligibility and office days
              </li>
              <li>
                <strong className="text-foreground">
                  Generate a schedule
                </strong>{" "}
                &mdash; Go to{" "}
                <Link
                  href="/dashboard/schedule"
                  className="underline text-foreground"
                >
                  Schedule
                </Link>{" "}
                to generate and publish the yearly schedule
              </li>
              <li>
                <strong className="text-foreground">
                  Review requests
                </strong>{" "}
                &mdash; Check{" "}
                <Link
                  href="/dashboard/requests"
                  className="underline text-foreground"
                >
                  Requests
                </Link>{" "}
                for vacation and swap requests
              </li>
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
