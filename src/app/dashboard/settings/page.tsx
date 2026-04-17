import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoleTypesTab } from "@/components/settings/RoleTypesTab";
import { HolidaysTab } from "@/components/settings/HolidaysTab";
import { UsersTab } from "@/components/settings/UsersTab";
import { AuditLogTab } from "@/components/settings/AuditLogTab";
import { VacationImportTab } from "@/components/settings/VacationImportTab";

export default async function SettingsPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const [roleTypes, holidays, users] = await Promise.all([
    prisma.roleType.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        _count: {
          select: { assignments: true, eligibilities: true, rules: true },
        },
      },
    }),
    prisma.holiday.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { assignments: true } },
      },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        physician: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { email: "asc" },
    }),
  ]);

  // Serialize dates for client components
  const serializedUsers = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));

  const currentUserId = session.user.id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage role types, holidays, user accounts, and review the audit log.
        </p>
      </div>

      <Tabs defaultValue="role-types">
        <TabsList>
          <TabsTrigger value="role-types">Role Types</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="vacation-import">Vacation Import</TabsTrigger>
          <TabsTrigger value="audit-log">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="role-types" className="mt-6">
          <RoleTypesTab roleTypes={roleTypes} />
        </TabsContent>

        <TabsContent value="holidays" className="mt-6">
          <HolidaysTab holidays={holidays} />
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <UsersTab users={serializedUsers} currentUserId={currentUserId} />
        </TabsContent>

        <TabsContent value="vacation-import" className="mt-6">
          <VacationImportTab />
        </TabsContent>

        <TabsContent value="audit-log" className="mt-6">
          <AuditLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
