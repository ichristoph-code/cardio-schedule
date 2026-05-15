import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// GET /api/preferred-task-day?physicianId=xxx
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as Record<string, unknown>).role as string;
  const isAdmin = userRole === "ADMIN";
  const { searchParams } = new URL(req.url);
  const queryPhysicianId = searchParams.get("physicianId");

  const physicianId =
    isAdmin && queryPhysicianId
      ? queryPhysicianId
      : ((session.user as Record<string, unknown>).physicianId as string | null);

  if (!physicianId) {
    return NextResponse.json({ preferredTaskDay: null });
  }

  const physician = await prisma.physician.findUnique({
    where: { id: physicianId },
    select: { preferredTaskDay: true },
  });

  return NextResponse.json({ preferredTaskDay: physician?.preferredTaskDay ?? null });
}

// POST /api/preferred-task-day — set or clear
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as Record<string, unknown>).role as string;
  const isAdmin = userRole === "ADMIN";

  const { preferredTaskDay, physicianId: bodyPhysicianId } = await req.json();

  const physicianId =
    isAdmin && bodyPhysicianId
      ? bodyPhysicianId
      : ((session.user as Record<string, unknown>).physicianId as string | null);

  if (!physicianId) {
    return NextResponse.json({ error: "No physician specified" }, { status: 403 });
  }

  if (
    preferredTaskDay !== null &&
    (typeof preferredTaskDay !== "number" || preferredTaskDay < 1 || preferredTaskDay > 5)
  ) {
    return NextResponse.json(
      { error: "preferredTaskDay must be 1–5 (Mon–Fri) or null" },
      { status: 400 }
    );
  }

  await prisma.physician.update({
    where: { id: physicianId },
    data: { preferredTaskDay },
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "SET_PREFERRED_TASK_DAY",
    "Physician",
    physicianId,
    { preferredTaskDay }
  );

  return NextResponse.json({ success: true, preferredTaskDay });
}
