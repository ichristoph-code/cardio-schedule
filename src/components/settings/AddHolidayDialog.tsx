"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface AddHolidayDialogProps {
  onSuccess: () => void;
}

export function AddHolidayDialog({ onSuccess }: AddHolidayDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const weight = Number(formData.get("weight"));

    try {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, weight }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create holiday");
        setLoading(false);
        return;
      }

      setOpen(false);
      setLoading(false);
      toast.success("Holiday created");
      onSuccess();
      router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground h-10 px-4 py-2 text-sm font-medium hover:bg-primary/90">
        <Plus className="mr-2 h-4 w-4" />
        Add Holiday
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Holiday</DialogTitle>
          <DialogDescription>
            Create a new holiday for use in schedule generation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="addHolidayName">Name</Label>
            <Input
              id="addHolidayName"
              name="name"
              placeholder="e.g. Christmas Day"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="addHolidayWeight">Weight</Label>
            <Input
              id="addHolidayWeight"
              name="weight"
              type="number"
              defaultValue={1}
              min={1}
              max={5}
              required
            />
            <p className="text-xs text-muted-foreground">
              Higher weight holidays (e.g., Christmas = 2) are given more
              consideration during equitable distribution.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Holiday"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
