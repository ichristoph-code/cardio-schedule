"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function ScheduleGenerateButton() {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [selectedYear, setSelectedYear] = useState(
    String(new Date().getFullYear())
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear + i - 1);

  function handleDialogChange(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      setPassword("");
      setPasswordError("");
    }
  }

  async function handleGenerate() {
    setPasswordError("");

    if (!password.trim()) {
      setPasswordError("Please enter your password to confirm.");
      return;
    }

    // Verify password via dedicated endpoint
    setVerifying(true);
    try {
      const verifyRes = await fetch("/api/auth/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        setPasswordError(
          verifyRes.status === 403
            ? "Incorrect password. Please try again."
            : data.error || "Could not verify password."
        );
        setVerifying(false);
        return;
      }
    } catch {
      setPasswordError("Could not verify password. Please try again.");
      setVerifying(false);
      return;
    }
    setVerifying(false);

    setGenerating(true);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: Number(selectedYear) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate");
      }

      const result = await res.json();
      toast.success(
        `Schedule generated with ${result.assignmentCount} assignments`
      );
      handleDialogChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const isLoading = generating || verifying;

  return (
    <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
      <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground h-10 px-4 py-2 text-sm font-medium hover:bg-primary/90 cursor-pointer">
        <Calendar className="mr-2 h-4 w-4" />
        Generate Schedule
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Schedule</DialogTitle>
          <DialogDescription>
            Create a new yearly schedule using the current rules and physician
            roster.
          </DialogDescription>
        </DialogHeader>

        {/* Warning banner */}
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive">
                This action will replace the entire existing schedule
              </p>
              <p className="text-sm text-muted-foreground">
                Do <strong>not</strong> generate a new schedule unless you are
                certain you want to overwrite all current assignments for the
                selected year. This cannot be undone. Any manual edits or swaps
                applied to the existing schedule will be lost.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="schedule-year">Year</Label>
            <Select
              value={selectedYear}
              onValueChange={(v) => v && setSelectedYear(v)}
            >
              <SelectTrigger id="schedule-year" className="mt-1">
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
          </div>

          <div>
            <Label htmlFor="confirm-password">
              Re-enter your password to confirm
            </Label>
            <Input
              id="confirm-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError("");
              }}
              placeholder="Enter your password"
              className="mt-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isLoading) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
            />
            {passwordError && (
              <p className="text-sm text-destructive mt-1">{passwordError}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleDialogChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleGenerate}
            disabled={isLoading || !password.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {verifying ? "Verifying..." : "Generating..."}
              </>
            ) : (
              "Generate & Replace Schedule"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
