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
import { Trash2 } from "lucide-react";

export function DeletePhysicianButton({
  physicianId,
  physicianName,
}: {
  physicianId: string;
  physicianName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setError("");
    setLoading(true);

    const res = await fetch(`/api/physicians/${physicianId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to delete physician");
      setLoading(false);
      return;
    }

    setOpen(false);
    setLoading(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center rounded-md h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-accent transition-colors cursor-pointer">
        <Trash2 className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Physician</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{physicianName}</strong>? This
            will permanently remove their account, all schedule assignments,
            vacation requests, and related data. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? "Deleting..." : "Delete Physician"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
