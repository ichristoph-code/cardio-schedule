"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Calendar, Loader2, Eye, Send, Archive } from "lucide-react";
import { toast } from "sonner";

interface ScheduleInfo {
  id: string;
  year: number;
  status: string;
  generatedAt: string | null;
  publishedAt: string | null;
  assignmentCount: number;
}

export function ScheduleManager({
  schedules,
  isAdmin,
}: {
  schedules: ScheduleInfo[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [selectedYear, setSelectedYear] = useState(
    String(new Date().getFullYear())
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear + i - 1);

  async function handleGenerate() {
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
      setDialogOpen(false);
      router.refresh();
      router.push(`/dashboard/schedule/${result.scheduleId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) throw new Error("Failed to update");

      toast.success(
        status === "PUBLISHED" ? "Schedule published!" : "Status updated"
      );
      router.refresh();
    } catch {
      toast.error("Failed to update schedule status");
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <Badge variant="secondary">Draft</Badge>;
      case "PUBLISHED":
        return <Badge className="bg-green-600 hover:bg-green-700">Published</Badge>;
      case "ARCHIVED":
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground h-10 px-4 py-2 text-sm font-medium hover:bg-primary/90">
            <Calendar className="mr-2 h-4 w-4" />
            Generate Schedule
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Schedule</DialogTitle>
              <DialogDescription>
                Create a new yearly schedule. If a schedule already exists for
                the selected year, it will be replaced.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <label className="text-sm font-medium">Year</label>
              <Select value={selectedYear} onValueChange={(v) => v && setSelectedYear(v)}>
                <SelectTrigger className="mt-1">
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
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={generating}
              >
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {schedules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No schedules yet</h3>
            <p className="text-muted-foreground">
              {isAdmin
                ? "Click \"Generate Schedule\" to create your first schedule."
                : "No schedules have been published yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {schedules.map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">{s.year} Schedule</CardTitle>
                    <CardDescription>
                      {s.assignmentCount.toLocaleString()} assignments
                      {s.generatedAt &&
                        ` \u00b7 Generated ${new Date(s.generatedAt).toLocaleDateString()}`}
                      {s.publishedAt &&
                        ` \u00b7 Published ${new Date(s.publishedAt).toLocaleDateString()}`}
                    </CardDescription>
                  </div>
                  {statusBadge(s.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      router.push(`/dashboard/schedule/${s.id}`)
                    }
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </Button>
                  {isAdmin && s.status === "DRAFT" && (
                    <Button
                      size="sm"
                      onClick={() => handleStatusChange(s.id, "PUBLISHED")}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Publish
                    </Button>
                  )}
                  {isAdmin && s.status === "PUBLISHED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusChange(s.id, "ARCHIVED")}
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      Archive
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
