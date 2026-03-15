import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Log an action to the audit trail.
 *
 * @param userId    – the User.id performing the action
 * @param action    – verb describing what happened (e.g. "APPROVE_VACATION")
 * @param entityType – the table/model affected (e.g. "VacationRequest")
 * @param entityId  – the primary key of the affected record
 * @param details   – optional JSON payload with extra context
 */
export async function auditLog(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  details?: Record<string, unknown>
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        details: (details ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    // Audit logging should never break the main flow
    console.error("Audit log failed:", err);
  }
}
