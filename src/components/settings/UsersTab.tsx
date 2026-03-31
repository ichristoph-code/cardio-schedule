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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Pencil, Trash2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { AddUserDialog } from "./AddUserDialog";
import { ResetPasswordDialog } from "./ResetPasswordDialog";

const selectClassName =
  "flex h-9 w-full items-center rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 text-[13px] shadow-[0_0.5px_1px_rgba(0,0,0,0.04)] transition-all duration-200 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:shadow-[0_0.5px_2px_rgba(0,0,0,0.06)] dark:border-input dark:bg-input/30";

interface UserData {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  physician: { id: string; firstName: string; lastName: string } | null;
}

interface UsersTabProps {
  users: UserData[];
  currentUserId: string;
}

export function UsersTab({ users, currentUserId }: UsersTabProps) {
  const router = useRouter();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<UserData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserData | null>(
    null
  );

  async function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingUser) return;
    setEditError("");
    setEditLoading(true);

    const formData = new FormData(e.currentTarget);

    const res = await fetch(`/api/users/${editingUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        role: formData.get("role"),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setEditError(data.error || "Failed to update user");
      setEditLoading(false);
      return;
    }

    setEditDialogOpen(false);
    setEditingUser(null);
    setEditLoading(false);
    toast.success("User updated successfully");
    router.refresh();
  }

  async function handleDelete() {
    if (!deletingUser) return;
    setDeleteError("");
    setDeleteLoading(true);

    const res = await fetch(`/api/users/${deletingUser.id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json();
      if (res.status === 409) {
        setDeleteError(
          data.error ||
            "Cannot delete this user because their linked physician has active assignments."
        );
      } else {
        setDeleteError(data.error || "Failed to delete user");
      }
      setDeleteLoading(false);
      return;
    }

    setDeleteDialogOpen(false);
    setDeletingUser(null);
    setDeleteLoading(false);
    toast.success("User deleted successfully");
    router.refresh();
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getRoleBadgeClass(role: string) {
    switch (role) {
      case "ADMIN":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case "PHYSICIAN":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      default:
        return "";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Users</h3>
          <p className="text-sm text-muted-foreground">
            Manage user accounts and their roles.
          </p>
        </div>
        <AddUserDialog />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Linked Physician</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[70px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={getRoleBadgeClass(user.role)}
                    >
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.physician
                      ? `${user.physician.firstName} ${user.physician.lastName}`
                      : "\u2014"}
                  </TableCell>
                  <TableCell>{formatDate(user.createdAt)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent hover:text-accent-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingUser(user);
                            setEditError("");
                            setEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setResetPasswordUser(user);
                            setResetPasswordOpen(true);
                          }}
                        >
                          <KeyRound className="mr-2 h-4 w-4" />
                          Reset Password
                        </DropdownMenuItem>
                        {user.id !== currentUserId && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setDeletingUser(user);
                              setDeleteError("");
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(value) => {
          setEditDialogOpen(value);
          if (!value) {
            setEditingUser(null);
            setEditError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update the user&apos;s email address and role.
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editUserEmail">Email</Label>
                <Input
                  id="editUserEmail"
                  name="email"
                  type="email"
                  defaultValue={editingUser.email}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editUserRole">Role</Label>
                <select
                  id="editUserRole"
                  name="role"
                  defaultValue={editingUser.role}
                  className={selectClassName}
                >
                  <option value="ADMIN">Admin</option>
                  <option value="PHYSICIAN">Physician</option>
                </select>
              </div>
              {editError && (
                <p className="text-sm text-destructive">{editError}</p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={editLoading}>
                  {editLoading ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(value) => {
          setDeleteDialogOpen(value);
          if (!value) {
            setDeletingUser(null);
            setDeleteError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deletingUser?.email}</strong>? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteLoading}
            >
              {deleteLoading ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {resetPasswordUser && (
        <ResetPasswordDialog
          userId={resetPasswordUser.id}
          userEmail={resetPasswordUser.email}
          open={resetPasswordOpen}
          onOpenChange={(value) => {
            setResetPasswordOpen(value);
            if (!value) {
              setResetPasswordUser(null);
            }
          }}
        />
      )}
    </div>
  );
}
