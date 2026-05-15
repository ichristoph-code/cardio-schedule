"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface RoleTypeInfo {
  id: string;
  displayName: string;
  category: string;
}

interface ExistingSchedule {
  year: number;
  status: string;
}

interface ScheduleGenerateButtonProps {
  roleTypes?: RoleTypeInfo[];
  existingSchedules?: ExistingSchedule[];
}

const CATEGORY_LABELS: Record<string, string> = {
  ON_CALL: "On Call",
  DAYTIME: "Daytime",
  READING: "Reading",
  SPECIAL: "Special",
};

const CATEGORY_ORDER = ["ON_CALL", "DAYTIME", "READING", "SPECIAL"];

function existingStatusBadge(status: string) {
  switch (status) {
    case "DRAFT":
      return <Badge variant="secondary" className="text-xs">Draft exists</Badge>;
    case "PUBLISHED":
      return <Badge className="bg-green-600 hover:bg-green-600 text-xs">Published exists</Badge>;
    case "ARCHIVED":
      return <Badge variant="outline" className="text-xs">Archived exists</Badge>;
    default:
      return null;
  }
}

export function ScheduleGenerateButton({
  roleTypes = [],
  existingSchedules = [],
}: ScheduleGenerateButtonProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [password, setPassword] = useState("");

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear + i - 1);
  const existingByYear = new Map(existingSchedules.map((s) => [s.year, s.status]));

  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [checkedRoleIds, setCheckedRoleIds] = useState<Set<string>>(
    () => new Set<string>()
  );

  const groupedRoles = CATEGORY_ORDER
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat] ?? cat,
      roles: roleTypes.filter((r) => r.category === cat),
    }))
    .filter((g) => g.roles.length > 0);

  const allChecked = roleTypes.length > 0 && roleTypes.every((r) => checkedRoleIds.has(r.id));
  const isPartial = roleTypes.length > 0 && checkedRoleIds.size < roleTypes.length;
  const existingStatus = existingByYear.get(Number(selectedYear));
  const willOverwrite = !!existingStatus;

  function toggleRole(id: string) {
    setCheckedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategory(cat: string) {
    const catIds = roleTypes.filter((r) => r.category === cat).map((r) => r.id);
    const allOn = catIds.every((id) => checkedRoleIds.has(id));
    setCheckedRoleIds((prev) => {
      const next = new Set(prev);
      for (const id of catIds) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allChecked) {
      setCheckedRoleIds(new Set());
    } else {
      setCheckedRoleIds(new Set(roleTypes.map((r) => r.id)));
    }
  }

  function handleDialogChange(open: boolean) {
    setDialogOpen(open);
    if (!open) setPassword("");
  }

  async function verifyPassword(): Promise<boolean> {
    setVerifying(true);
    try {
      const verifyRes = await fetch("/api/auth/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        toast.error(
          verifyRes.status === 403
            ? "Incorrect password. Please try again."
            : data.error || "Could not verify password."
        );
        return false;
      }
      return true;
    } catch {
      toast.error("Could not verify password. Please try again.");
      return false;
    } finally {
      setVerifying(false);
    }
  }

  async function handleGenerate() {
    if (checkedRoleIds.size === 0) {
      toast.error("Select at least one role to generate.");
      return;
    }
    if (!password.trim()) {
      toast.error("Enter your password to confirm.");
      return;
    }

    if (!await verifyPassword()) return;

    setGenerating(true);
    try {
      const body: Record<string, unknown> = { year: Number(selectedYear) };
      if (isPartial) body.roleTypeIds = [...checkedRoleIds];

      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate");
      }

      const result = await res.json();
      const roleLabel = isPartial
        ? `${checkedRoleIds.size} role${checkedRoleIds.size > 1 ? "s" : ""}`
        : "all roles";
      toast.success(
        `${selectedYear} schedule generated (${roleLabel}, ${result.assignmentCount} assignments)`
      );
      handleDialogChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleReset() {
    if (checkedRoleIds.size === 0) {
      toast.error("Select at least one role to reset.");
      return;
    }
    if (!password.trim()) {
      toast.error("Enter your password to confirm.");
      return;
    }

    if (!await verifyPassword()) return;

    setResetting(true);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: Number(selectedYear),
          roleTypeIds: [...checkedRoleIds],
          resetOnly: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reset");
      }
      const result = await res.json();
      toast.success(
        `Reset ${checkedRoleIds.size} role${checkedRoleIds.size > 1 ? "s" : ""} — ${result.deletedCount} assignments removed`
      );
      handleDialogChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  const isLoading = generating || resetting || verifying;

  return (
    <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
      <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground h-10 px-4 py-2 text-sm font-medium hover:bg-primary/90 cursor-pointer">
        <Calendar className="mr-2 h-4 w-4" />
        Generate Schedule
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Schedule</DialogTitle>
          <DialogDescription>
            Check the roles you want to act on, then choose an action. Unchecked roles are left unchanged.
          </DialogDescription>
        </DialogHeader>

        {/* Year */}
        <div>
          <Label htmlFor="schedule-year">Year</Label>
          <div className="flex items-center gap-3 mt-1">
            <Select
              value={selectedYear}
              onValueChange={(v) => v && setSelectedYear(v)}
            >
              <SelectTrigger id="schedule-year" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {existingStatus && existingStatusBadge(existingStatus)}
          </div>
        </div>

        {/* Role type checklist */}
        {roleTypes.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Select roles to regenerate or reset</Label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                {allChecked ? "Deselect all" : "Select all"}
              </button>
            </div>

            <div className="rounded-lg border divide-y">
              {groupedRoles.map((group) => {
                const catIds = group.roles.map((r) => r.id);
                const catAllChecked = catIds.every((id) => checkedRoleIds.has(id));
                const catSomeChecked = catIds.some((id) => checkedRoleIds.has(id));

                return (
                  <div key={group.category}>
                    {/* Category header */}
                    <label className="flex items-center gap-3 px-4 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                      <Checkbox
                        checked={catAllChecked}
                        data-state={catSomeChecked && !catAllChecked ? "indeterminate" : undefined}
                        onCheckedChange={() => toggleCategory(group.category)}
                        disabled={isLoading}
                      />
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.label}
                      </span>
                    </label>

                    {/* Role rows */}
                    {group.roles.map((role) => (
                      <label
                        key={role.id}
                        className="flex items-center gap-3 px-4 pl-10 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
                      >
                        <Checkbox
                          checked={checkedRoleIds.has(role.id)}
                          onCheckedChange={() => toggleRole(role.id)}
                          disabled={isLoading}
                        />
                        <span className="text-sm">{role.displayName}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Warning */}
        {willOverwrite && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
            <div className="flex gap-2.5">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                {isPartial
                  ? `The checked roles in the ${selectedYear} schedule will be replaced. Other roles are untouched.`
                  : `The entire ${selectedYear} schedule will be replaced. This cannot be undone.`}
              </p>
            </div>
          </div>
        )}

        {/* Password */}
        <div>
          <Label htmlFor="confirm-password">Re-enter your password to confirm</Label>
          <Input
            id="confirm-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="mt-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading) {
                e.preventDefault();
                handleGenerate();
              }
            }}
          />
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => handleDialogChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <div className="flex gap-2 sm:ml-auto">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isLoading || !password.trim() || checkedRoleIds.size === 0 || !existingStatus}
              className="border-destructive/50 text-destructive hover:bg-destructive/5"
            >
              {resetting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Resetting...</>
              ) : (
                <>Reset {checkedRoleIds.size > 0 ? `${checkedRoleIds.size} Role${checkedRoleIds.size > 1 ? "s" : ""}` : ""}</>
              )}
            </Button>
            <Button
              variant="destructive"
              onClick={handleGenerate}
              disabled={isLoading || !password.trim() || checkedRoleIds.size === 0}
            >
              {generating || (verifying && !resetting) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {verifying ? "Verifying..." : "Generating..."}
                </>
              ) : (
                <>
                  Generate
                  {isPartial ? ` ${checkedRoleIds.size} Role${checkedRoleIds.size > 1 ? "s" : ""}` : " All"}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
