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
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AddRoleTypeDialog } from "./AddRoleTypeDialog";

const selectClassName =
  "flex h-9 w-full items-center rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 text-[13px] shadow-[0_0.5px_1px_rgba(0,0,0,0.04)] transition-all duration-200 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:shadow-[0_0.5px_2px_rgba(0,0,0,0.06)] dark:border-input dark:bg-input/30";

const CATEGORY_OPTIONS = ["ON_CALL", "DAYTIME", "READING", "SPECIAL"] as const;

const CATEGORY_STYLES: Record<string, string> = {
  ON_CALL: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  DAYTIME: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  READING:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  SPECIAL:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

export interface RoleTypeData {
  id: string;
  name: string;
  displayName: string;
  category: string;
  description: string | null;
  sortOrder: number;
  minRequired: number;
  maxRequired: number;
  _count: { assignments: number; eligibilities: number; rules: number };
}

interface RoleTypesTabProps {
  roleTypes: RoleTypeData[];
}

export function RoleTypesTab({ roleTypes }: RoleTypesTabProps) {
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RoleTypeData | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [editDisplayName, setEditDisplayName] = useState("");
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("0");
  const [editMinRequired, setEditMinRequired] = useState("0");
  const [editMaxRequired, setEditMaxRequired] = useState("1");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleTypeData | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openEdit(rt: RoleTypeData) {
    setEditTarget(rt);
    setEditDisplayName(rt.displayName);
    setEditName(rt.name);
    setEditCategory(rt.category);
    setEditDescription(rt.description ?? "");
    setEditSortOrder(String(rt.sortOrder));
    setEditMinRequired(String(rt.minRequired));
    setEditMaxRequired(String(rt.maxRequired));
    setEditOpen(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditSubmitting(true);

    try {
      const res = await fetch(`/api/role-types/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editDisplayName.trim(),
          name: editName.trim(),
          category: editCategory,
          description: editDescription.trim() || null,
          sortOrder: parseInt(editSortOrder, 10),
          minRequired: parseInt(editMinRequired, 10),
          maxRequired: parseInt(editMaxRequired, 10),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Failed to update role type");
      } else {
        toast.success("Role type updated");
        setEditOpen(false);
        router.refresh();
      }
    } catch {
      toast.error("Network error");
    }

    setEditSubmitting(false);
  }

  function openDelete(rt: RoleTypeData) {
    setDeleteTarget(rt);
    setDeleteOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/role-types/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        toast.error(
          data?.error ??
            "Cannot delete this role type because it is still in use."
        );
      } else if (!res.ok) {
        toast.error("Failed to delete role type");
      } else {
        toast.success("Role type deleted");
        setDeleteOpen(false);
        router.refresh();
      }
    } catch {
      toast.error("Network error");
    }

    setDeleting(false);
  }

  const totalUsages = deleteTarget
    ? deleteTarget._count.assignments +
      deleteTarget._count.eligibilities +
      deleteTarget._count.rules
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Role Types</h3>
          <p className="text-sm text-muted-foreground">
            Manage the types of roles that physicians can be assigned to in the
            schedule.
          </p>
        </div>
        <AddRoleTypeDialog onSuccess={() => router.refresh()} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">
              Internal Name
            </TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="hidden sm:table-cell">Sort Order</TableHead>
            <TableHead className="hidden sm:table-cell">
              Min / Max Required
            </TableHead>
            <TableHead className="w-[50px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roleTypes.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center text-muted-foreground py-8"
              >
                No role types defined yet. Add one to get started.
              </TableCell>
            </TableRow>
          ) : (
            roleTypes.map((rt) => (
              <TableRow key={rt.id}>
                <TableCell>
                  <div className="font-medium">{rt.displayName}</div>
                  {rt.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {rt.description}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="text-muted-foreground font-mono text-xs">
                    {rt.name}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_STYLES[rt.category] ?? ""}`}
                  >
                    {rt.category}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {rt.sortOrder}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {rt.minRequired} / {rt.maxRequired}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent hover:text-accent-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(rt)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => openDelete(rt)}
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

      {/* Edit Role Type Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Role Type</DialogTitle>
            <DialogDescription>
              Update the properties of this role type.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-rt-displayName">Display Name</Label>
              <Input
                id="edit-rt-displayName"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-rt-name">Internal Name</Label>
              <Input
                id="edit-rt-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-rt-category">Category</Label>
              <select
                id="edit-rt-category"
                className={selectClassName}
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-rt-description">Description</Label>
              <Input
                id="edit-rt-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-rt-sortOrder">Sort Order</Label>
                <Input
                  id="edit-rt-sortOrder"
                  type="number"
                  value={editSortOrder}
                  onChange={(e) => setEditSortOrder(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rt-minRequired">Min Required</Label>
                <Input
                  id="edit-rt-minRequired"
                  type="number"
                  min={0}
                  value={editMinRequired}
                  onChange={(e) => setEditMinRequired(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rt-maxRequired">Max Required</Label>
                <Input
                  id="edit-rt-maxRequired"
                  type="number"
                  min={0}
                  value={editMaxRequired}
                  onChange={(e) => setEditMaxRequired(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editSubmitting}>
                {editSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Role Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;
              {deleteTarget?.displayName}&quot;? This action cannot be undone.
              {totalUsages > 0 && (
                <>
                  {" "}
                  This role type is currently referenced by {totalUsages}{" "}
                  {totalUsages === 1 ? "record" : "records"} (assignments,
                  eligibilities, or rules). Deletion will fail if it is still in
                  use.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
