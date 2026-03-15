import { prisma } from "@/lib/prisma";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddRuleDialog } from "@/components/rules/AddRuleDialog";
import { RuleRow } from "@/components/rules/RuleRow";

export default async function RulesPage() {
  const [rules, roleTypes, physicians] = await Promise.all([
    prisma.schedulingRule.findMany({
      include: {
        roleType: {
          select: { id: true, name: true, displayName: true, category: true },
        },
        physician: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    }),
    prisma.roleType.findMany({
      select: { id: true, name: true, displayName: true, category: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.physician.findMany({
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  // Serialize for client components (dates → strings)
  const serializedRules = rules.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    ruleType: r.ruleType,
    roleTypeId: r.roleTypeId,
    roleType: r.roleType,
    physicianId: r.physicianId,
    physician: r.physician,
    parameters: r.parameters as Record<string, unknown>,
    isActive: r.isActive,
    priority: r.priority,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Scheduling Rules
          </h1>
          <p className="text-muted-foreground">
            Manage the rules that govern how the scheduling algorithm assigns
            roles to physicians.
          </p>
        </div>
        <AddRuleDialog roleTypes={roleTypes} physicians={physicians} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden md:table-cell">Role</TableHead>
              <TableHead className="hidden md:table-cell">Priority</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {serializedRules.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No scheduling rules configured. Click &quot;Add Rule&quot; to
                  create one.
                </TableCell>
              </TableRow>
            ) : (
              serializedRules.map((rule) => (
                <RuleRow key={rule.id} rule={rule} roleTypes={roleTypes} physicians={physicians} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md bg-muted/50 p-4">
        <h3 className="text-sm font-medium mb-2">Rule Types</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="font-medium text-red-700 dark:text-red-400">
              Exclusion
            </dt>
            <dd className="text-muted-foreground">
              Exclude or require specific subspecialties for a role
            </dd>
          </div>
          <div>
            <dt className="font-medium text-blue-700 dark:text-blue-400">
              Prerequisite
            </dt>
            <dd className="text-muted-foreground">
              Require conditions like office day for a role
            </dd>
          </div>
          <div>
            <dt className="font-medium text-amber-700 dark:text-amber-400">
              Conflict
            </dt>
            <dd className="text-muted-foreground">
              Prevent scheduling conflicts (e.g., no back-to-back call)
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-700 dark:text-gray-400">
              Distribution
            </dt>
            <dd className="text-muted-foreground">
              Control how assignments are distributed across physicians
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
