"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EditRuleDialog } from "./EditRuleDialog";

interface RoleTypeOption {
  id: string;
  name: string;
  displayName: string;
  category: string;
}

interface PhysicianOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface RuleData {
  id: string;
  name: string;
  description: string | null;
  ruleType: string;
  roleTypeId: string | null;
  roleType: RoleTypeOption | null;
  physicianId: string | null;
  physician: PhysicianOption | null;
  parameters: Record<string, unknown>;
  isActive: boolean;
  priority: number;
}

const RULE_TYPE_STYLES: Record<string, string> = {
  EXCLUSION:
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  PREREQUISITE:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  DISTRIBUTION:
    "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  CONFLICT:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

interface RuleRowProps {
  rule: RuleData;
  roleTypes: RoleTypeOption[];
  physicians: PhysicianOption[];
}

export function RuleRow({ rule, roleTypes, physicians }: RuleRowProps) {
  const router = useRouter();
  const [toggling, setToggling] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleToggle(checked: boolean) {
    setToggling(true);
    try {
      const res = await fetch(`/api/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: checked }),
      });
      if (!res.ok) {
        toast.error("Failed to update rule");
      } else {
        toast.success(checked ? "Rule enabled" : "Rule disabled");
        router.refresh();
      }
    } catch {
      toast.error("Network error");
    }
    setToggling(false);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete rule");
      } else {
        toast.success("Rule deleted");
        setDeleteOpen(false);
        router.refresh();
      }
    } catch {
      toast.error("Network error");
    }
    setDeleting(false);
  }

  return (
      <TableRow>
        <TableCell>
          <div className="font-medium">{rule.name}</div>
          {rule.description && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {rule.description}
            </div>
          )}
          {rule.physician && (
            <div className="text-xs text-blue-600 mt-0.5">
              Dr. {rule.physician.lastName}
            </div>
          )}
        </TableCell>
        <TableCell>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${RULE_TYPE_STYLES[rule.ruleType] ?? ""}`}
          >
            {rule.ruleType}
          </span>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          {rule.roleType?.displayName ?? (
            <span className="text-muted-foreground">Global</span>
          )}
        </TableCell>
        <TableCell className="hidden md:table-cell">{rule.priority}</TableCell>
        <TableCell>
          <Switch
            checked={rule.isActive}
            onCheckedChange={handleToggle}
            disabled={toggling}
            size="sm"
          />
        </TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent hover:text-accent-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteOpen(true)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Edit dialog — portal renders outside table */}
          <EditRuleDialog
            rule={rule}
            roleTypes={roleTypes}
            physicians={physicians}
            open={editOpen}
            onOpenChange={setEditOpen}
          />

          {/* Delete confirmation dialog — portal renders outside table */}
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Rule</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete &quot;{rule.name}&quot;? This
                  action cannot be undone. If you want to temporarily disable
                  it, use the active toggle instead.
                </DialogDescription>
              </DialogHeader>
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
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TableCell>
      </TableRow>
  );
}
