import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { scopeSchema } from "@/lib/scheduling/plan";
import { previewSchedule, applySchedule, restoreSchedule, ScheduleConflict, latestRecovery } from "@/lib/scheduling/service";

export const maxDuration = 60;

// GET /api/schedules — list all schedules
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recoveryYear = new URL(req.url).searchParams.get("recoveryYear");
  if (recoveryYear !== null) {
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });
    const year = Number(recoveryYear);
    if (!Number.isInteger(year) || year < 2024 || year > 2100) return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    return NextResponse.json({ recovery: await latestRecovery(year) });
  }

  const schedules = await prisma.schedule.findMany({
    orderBy: { year: "desc" },
    include: {
      _count: { select: { assignments: true } },
    },
  });

  return NextResponse.json(schedules);
}

// Preview is read-only for schedules. Apply and restore verify the password on the server.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  try {
    const body = await req.json();
    if (body.action === "preview") {
      const parsed = scopeSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      return NextResponse.json(await previewSchedule(parsed.data, session.user.id));
    }
    if (body.action !== "apply" && body.action !== "restore") {
      return NextResponse.json({ error: "Create a preview before changing a schedule" }, { status: 400 });
    }
    const id = body.action === "apply" ? body.previewId : body.recoveryId;
    if (typeof id !== "string" || typeof body.password !== "string") {
      return NextResponse.json({ error: "Confirmation and password are required" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user || user.role !== "ADMIN" || !await bcrypt.compare(body.password, user.passwordHash)) {
      return NextResponse.json({ error: "Incorrect password or access changed" }, { status: 403 });
    }
    return NextResponse.json(body.action === "apply"
      ? await applySchedule(id, session.user.id)
      : await restoreSchedule(id, session.user.id));
  } catch (error) {
    if (error instanceof ScheduleConflict || (error && typeof error === "object" && "code" in error && error.code === "P2034")) {
      return NextResponse.json({ error: error instanceof ScheduleConflict ? error.message : "Another edit happened at the same time. Please preview again." }, { status: 409 });
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    console.error("Schedule operation failed:", error);
    return NextResponse.json({ error: "The operation failed. No schedule changes were saved." }, { status: 500 });
  }
}
