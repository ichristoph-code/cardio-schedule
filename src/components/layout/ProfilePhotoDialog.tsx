"use client";

import { useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SIZE = 256;

/** Centre-crop to a square and shrink to SIZE x SIZE, as a JPEG. */
async function toAvatarJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.getContext("2d")!.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, SIZE, SIZE,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.85),
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  initials: string;
}

export function ProfilePhotoDialog({ open, onOpenChange, userId, initials }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  // The newly chosen photo and an object URL to preview it; until one is
  // chosen the circle shows the saved photo.
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const blob = await toAvatarJpeg(file);
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("Couldn't read that image. Try a JPEG or PNG.");
    }
  }

  // The header's photo has a fixed URL, so reload to show the change everywhere.
  async function send(init: RequestInit) {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/avatar", init);
    if (res.ok) {
      window.location.reload();
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.error ?? "Couldn't save the photo.");
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Profile photo</DialogTitle>
          <DialogDescription>
            Shown next to your name. Other signed-in users can see it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <Avatar className="h-32 w-32">
            <AvatarImage src={photo?.url ?? `/api/avatar/${userId}`} alt="" />
            <AvatarFallback className="text-3xl">{initials}</AvatarFallback>
          </Avatar>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={saving}>
            Choose photo…
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => send({ method: "DELETE" })} disabled={saving}>
            Remove photo
          </Button>
          <Button onClick={() => send({ method: "PUT", body: photo?.blob })} disabled={!photo || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
