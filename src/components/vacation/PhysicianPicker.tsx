"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Physician {
  id: string;
  firstName: string;
  lastName: string;
}

interface Props {
  physicians: Physician[];
  selectedId: string;
  year: number;
}

export function PhysicianPicker({ physicians, selectedId, year }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onPhysicianChange(id: string | null) {
    if (!id) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("physician", id);
    router.push(`/dashboard/vacation?${params.toString()}`);
  }

  function onYearChange(y: string | null) {
    if (!y) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", y);
    router.push(`/dashboard/vacation?${params.toString()}`);
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Select value={selectedId} onValueChange={onPhysicianChange}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Select physician">
            {(() => {
              const p = physicians.find((ph) => ph.id === selectedId);
              return p ? `${p.lastName}, ${p.firstName}` : "Select physician";
            })()}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {physicians.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.lastName}, {p.firstName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={String(year)} onValueChange={onYearChange}>
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
