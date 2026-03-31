import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { orderedIds } = body as { orderedIds: string[] };

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json(
      { error: "orderedIds must be a non-empty array" },
      { status: 400 }
    );
  }

  // Assign priorities in descending order (first item = highest priority)
  const updates = orderedIds.map((id, index) =>
    prisma.schedulingRule.update({
      where: { id },
      data: { priority: orderedIds.length - index },
    })
  );

  await prisma.$transaction(updates);

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "REORDER_RULES",
    "SchedulingRule",
    "bulk",
    { count: orderedIds.length }
  );

  return NextResponse.json({ success: true });
}
