"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, Pencil, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { AddHolidayDialog } from "./AddHolidayDialog";

export interface HolidayData {
  id: string;
  name: string;
  weight: number;
  _count: { assignments: number };
}

interface HolidaysTabProps {
  holidays: HolidayData[];
}

export function HolidaysTab({ holidays }: HolidaysTabProps) {
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [editHoliday, setEditHoliday] = useState<HolidayData | null>(null);
  const [editName, setEditName] = useState("");
  const [editWeight, setEditWeight] = useState(1);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteHoliday, setDeleteHoliday] = useState<HolidayData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function openEdit(holiday: HolidayData) {
    setEditHoliday(holiday);
    setEditName(holiday.name);
    setEditWeight(holiday.weight);
    setEditError("");
    setEditOpen(true);
  }

  function openDelete(holiday: HolidayData) {
    setDeleteHoliday(holiday);
    setDeleteError("");
    setDeleteOpen(true);
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editHoliday) return;
    setEditError("");
    setEditLoading(true);

    try {
      const res = await fetch(`/api/holidays/${editHoliday.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, weight: editWeight }),
      });

      if (!res.ok) {
        const data = await res.json();
        setEditError(data.error || "Failed to update holiday");
        setEditLoading(false);
        return;
      }

      setEditOpen(false);
      setEditLoading(false);
      toast.success("Holiday updated");
      router.refresh();
    } catch {
      setEditError("Network error");
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteHoliday) return;
    setDeleteError("");
    setDeleteLoading(true);

    try {
      const res = await fetch(`/api/holidays/${deleteHoliday.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        if (res.status === 409) {
          setDeleteError(
            "Cannot delete this holiday because it has existing assignments. Remove the assignments first."
          );
        } else {
          const data = await res.json();
          setDeleteError(data.error || "Failed to delete holiday");
        }
        setDeleteLoading(false);
        return;
      }

      setDeleteOpen(false);
      setDeleteLoading(false);
      toast.success("Holiday deleted");
      router.refresh();
    } catch {
      setDeleteError("Network error");
      setDeleteLoading(false);
    }
  }

  function renderWeight(weight: number) {
    return (
      <span
        className="inline-flex items-center gap-0.5"
        title={`Weight ${weight} — higher weight means higher scheduling priority`}
      >
        {Array.from({ length: weight }, (_, i) => (
          <Star
            key={i}
            className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
          />
        ))}
        {Array.from({ length: 5 - weight }, (_, i) => (
          <Star
            key={`empty-${i}`}
            className="h-3.5 w-3.5 text-muted-foreground/30"
          />
        ))}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Holidays</h3>
          <p className="text-sm text-muted-foreground">
            Manage holidays used for equitable schedule distribution. Higher
            weight holidays are given more consideration when balancing
            assignments.
          </p>
        </div>
        <AddHolidayDialog onSuccess={() => router.refresh()} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead className="hidden sm:table-cell">
                Assignments
              </TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {holidays.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground py-8"
                >
                  No holidays configured yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              holidays.map((holiday) => (
                <TableRow key={holiday.id}>
                  <TableCell className="font-medium">{holiday.name}</TableCell>
                  <TableCell>{renderWeight(holiday.weight)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {holiday._count.assignments}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent hover:text-accent-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(holiday)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => openDelete(holiday)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Holiday</DialogTitle>
            <DialogDescription>
              Update the holiday name and weight.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editHolidayName">Name</Label>
              <Input
                id="editHolidayName"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editHolidayWeight">Weight</Label>
              <Input
                id="editHolidayWeight"
                type="number"
                value={editWeight}
                onChange={(e) => setEditWeight(Number(e.target.value))}
                min={1}
                max={5}
                required
              />
              <p className="text-xs text-muted-foreground">
                1 = standard, 5 = highest priority for equitable distribution.
              </p>
            </div>
            {editError && (
              <p className="text-sm text-destructive">{editError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editLoading}>
                {editLoading ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Holiday</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteHoliday?.name}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteLoading}
            >
              {deleteLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
