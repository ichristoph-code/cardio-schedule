import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { PhysicianProfileForm } from "@/components/physicians/PhysicianProfileForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PhysicianDetailPage({ params }: PageProps) {
  const { id } = await params;

  const physician = await prisma.physician.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, role: true } },
      eligibilities: { include: { roleType: true } },
      officeDays: true,
    },
  });

  if (!physician) notFound();

  const roleTypes = await prisma.roleType.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {physician.firstName} {physician.lastName}
        </h1>
        <p className="text-muted-foreground">{physician.user.email}</p>
      </div>

      <PhysicianProfileForm
        physician={{
          id: physician.id,
          firstName: physician.firstName,
          lastName: physician.lastName,
          email: physician.user.email,
          phone: physician.phone,
          fteDays: physician.fteDays,
          isInterventionalist: physician.isInterventionalist,
          isEP: physician.isEP,
          officeDays: physician.officeDays.map((d) => d.dayOfWeek),
          eligibleRoleIds: physician.eligibilities.map((e) => e.roleTypeId),
        }}
        roleTypes={roleTypes.map((r) => ({
          id: r.id,
          name: r.name,
          displayName: r.displayName,
          category: r.category,
        }))}
      />
    </div>
  );
}
