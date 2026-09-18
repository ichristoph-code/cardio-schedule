"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LAST_PHYSICIAN_COOKIE, LAST_YEAR_COOKIE, selectableYears } from "@/lib/vacation-prefs";

// Cookie names and the year list live in @/lib/vacation-prefs, not here: this is
// a Client Component, and the server-rendered page needs the same values. They
// are deliberately not re-exported from this file — importing them through a
// "use client" module is the trap this was moved to avoid.

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

  // Remember whichever physician is currently shown, so the next visit (with no
  // ?physician= in the URL) defaults to the last one viewed instead of the
  // alphabetical first. Read server-side via cookies() in the vacation page.
  useEffect(() => {
    document.cookie = `${LAST_PHYSICIAN_COOKIE}=${selectedId}; path=/; max-age=31536000; samesite=lax`;
  }, [selectedId]);

  // Likewise the year. Planning runs a year or more ahead, so defaulting to the
  // calendar year means re-picking on every visit once the practice has moved
  // on to scheduling the next one.
  useEffect(() => {
    document.cookie = `${LAST_YEAR_COOKIE}=${year}; path=/; max-age=31536000; samesite=lax`;
  }, [year]);

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

  const years = selectableYears();

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
