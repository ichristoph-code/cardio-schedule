import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil } from "lucide-react";
import { AddPhysicianDialog } from "@/components/physicians/AddPhysicianDialog";
import { DeletePhysicianButton } from "@/components/physicians/DeletePhysicianButton";

export default async function PhysiciansPage() {
  const physicians = await prisma.physician.findMany({
    include: {
      user: { select: { email: true } },
      eligibilities: { include: { roleType: true } },
      officeDays: true,
    },
    orderBy: { lastName: "asc" },
  });

  const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Physicians</h1>
          <p className="text-muted-foreground">
            Manage physician profiles, role eligibility, and office schedules.
          </p>
        </div>
        <AddPhysicianDialog />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead className="hidden md:table-cell">FTE</TableHead>
              <TableHead className="hidden md:table-cell">Subspecialty</TableHead>
              <TableHead className="hidden lg:table-cell">Office Days</TableHead>
              <TableHead className="hidden lg:table-cell">Eligible Roles</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {physicians.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No physicians added yet. Click &quot;Add Physician&quot; to get started.
                </TableCell>
              </TableRow>
            ) : (
              physicians.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    {doc.lastName}, {doc.firstName}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {doc.user.email}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {doc.fteDays}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex gap-1">
                      {doc.isInterventionalist && (
                        <Badge variant="secondary">Interventional</Badge>
                      )}
                      {doc.isEP && (
                        <Badge variant="secondary">EP</Badge>
                      )}
                      {!doc.isInterventionalist && !doc.isEP && (
                        <span className="text-muted-foreground text-sm">General</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex gap-1">
                      {doc.officeDays
                        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                        .map((d) => (
                          <Badge key={d.id} variant="outline" className="text-xs">
                            {dayNames[d.dayOfWeek]}
                          </Badge>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {doc.eligibilities.length} roles
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Link href={`/dashboard/physicians/${doc.id}`}>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <DeletePhysicianButton
                        physicianId={doc.id}
                        physicianName={`${doc.firstName} ${doc.lastName}`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
