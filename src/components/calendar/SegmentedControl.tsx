"use client";

import { cn } from "@/lib/utils";

export interface Segment<T extends string> {
  value: T;
  label: string;
  icon: React.ElementType;
}

/** The Monthly / Full Year style switch, shared by every calendar page. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  segments,
}: {
  value: T;
  onChange: (value: T) => void;
  segments: Segment<T>[];
}) {
  return (
    <div className="inline-flex items-center border rounded-lg p-0.5 bg-muted/40">
      {segments.map((s) => {
        const Icon = s.icon;
        const active = value === s.value;
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(s.value)}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs px-3 h-7 rounded-md font-medium transition-all",
              active
                ? "bg-white dark:bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
