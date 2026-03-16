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

      {/* Reading Distribution Methodology */}
      <div className="rounded-xl border bg-gradient-to-br from-emerald-50/80 via-white to-blue-50/80 dark:from-emerald-950/20 dark:via-background dark:to-blue-950/20 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/40 p-2 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1.5">
              Reading Study Distribution (Echo, MPI, etc.)
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Reading study assignments (Echo, MPI, and other interpretation duties) are distributed among
              participating physicians <strong className="text-foreground">proportional to their FTE</strong>.
              A physician at 100% FTE receives roughly twice as many reading days as one at 50% FTE.
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg bg-white/80 dark:bg-background/60 border p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">
                  Monthly Equalization
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The scheduler balances reading assignments roughly each month so no one physician
                  falls far behind or ahead within any 4-week window.
                </p>
              </div>
              <div className="rounded-lg bg-white/80 dark:bg-background/60 border p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
                  Annual Equalization
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Over the full year, assignment counts are precisely matched to each physician&apos;s
                  FTE target, correcting any month-to-month variance.
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3 italic">
              This two-level approach ensures fairness while keeping monthly workloads predictable.
              Individual preferred reading days (e.g., MPI on Monday) are honored when the physician
              is available, but do not override the FTE-based distribution.
            </p>
          </div>
        </div>
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
