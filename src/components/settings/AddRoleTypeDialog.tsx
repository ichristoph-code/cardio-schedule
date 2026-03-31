"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const selectClassName =
  "flex h-9 w-full items-center rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 text-[13px] shadow-[0_0.5px_1px_rgba(0,0,0,0.04)] transition-all duration-200 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:shadow-[0_0.5px_2px_rgba(0,0,0,0.06)] dark:border-input dark:bg-input/30";

const CATEGORY_OPTIONS = ["ON_CALL", "DAYTIME", "READING", "SPECIAL"] as const;

interface AddRoleTypeDialogProps {
  onSuccess: () => void;
}

function toUpperSnakeCase(str: string): string {
  return str
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s\-]+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .toUpperCase();
}

export function AddRoleTypeDialog({ onSuccess }: AddRoleTypeDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("ON_CALL");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [minRequired, setMinRequired] = useState("0");
  const [maxRequired, setMaxRequired] = useState("1");

  function handleDisplayNameChange(value: string) {
    setDisplayName(value);
    setName(toUpperSnakeCase(value));
  }

  function resetForm() {
    setDisplayName("");
    setName("");
    setCategory("ON_CALL");
    setDescription("");
    setSortOrder("0");
    setMinRequired("0");
    setMaxRequired("1");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch("/api/role-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          name: name.trim(),
          category,
          description: description.trim() || null,
          sortOrder: parseInt(sortOrder, 10),
          minRequired: parseInt(minRequired, 10),
          maxRequired: parseInt(maxRequired, 10),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Failed to create role type");
      } else {
        toast.success("Role type created successfully");
        resetForm();
        setOpen(false);
        onSuccess();
        router.refresh();
      }
    } catch {
      toast.error("Network error");
    }

    setSubmitting(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground h-10 px-4 py-2 text-sm font-medium hover:bg-primary/90">
        <Plus className="mr-2 h-4 w-4" />
        Add Role Type
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Role Type</DialogTitle>
          <DialogDescription>
            Define a new role type that physicians can be assigned to in the
            schedule.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-rt-displayName">Display Name</Label>
            <Input
              id="add-rt-displayName"
              value={displayName}
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              placeholder="e.g. Weekend Call"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-rt-name">Internal Name</Label>
            <Input
              id="add-rt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="AUTO_GENERATED"
              required
            />
            <p className="text-xs text-muted-foreground">
              Auto-generated from display name. Edit if needed.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-rt-category">Category</Label>
            <select
              id="add-rt-category"
              className={selectClassName}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-rt-description">Description</Label>
            <Input
              id="add-rt-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="add-rt-sortOrder">Sort Order</Label>
              <Input
                id="add-rt-sortOrder"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-rt-minRequired">Min Required</Label>
              <Input
                id="add-rt-minRequired"
                type="number"
                min={0}
                value={minRequired}
                onChange={(e) => setMinRequired(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-rt-maxRequired">Max Required</Label>
              <Input
                id="add-rt-maxRequired"
                type="number"
                min={0}
                value={maxRequired}
                onChange={(e) => setMaxRequired(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Role Type"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
