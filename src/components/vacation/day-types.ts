import { Palmtree, Sun, Moon, Building2, Stethoscope, Phone, PhoneOff, X } from "lucide-react";
import { DAY_COLORS } from "@/lib/colors";

// The day's current type, as derived from the calendar data.
export type DayState =
  | "VACATION"
  | "HALF_AM"
  | "HALF_PM"
  | "FLOAT"
  | "ROUNDER"
  | "CALL"
  | "NO_CALL"
  | "NONE";

// Each option maps a button to the /api/admin/calendar-day request it sends.
// To add a new day type later: add an entry here, extend the API route's TYPES
// (clear + apply), and add its colours to src/lib/colors.ts. Shared by the
// single-day editor sheet and the multi-day selection bar so the two can never
// drift apart.
export interface DayTypeOption {
  state: DayState;
  label: string;
  /** Shorter label for the tight horizontal selection bar. */
  shortLabel: string;
  icon: typeof Palmtree;
  type: string;            // calendar-day API "type"
  halfPeriod?: "MORNING" | "AFTERNOON";
  active: string;          // classes when this option is the current state
}

export const DAY_TYPE_OPTIONS: DayTypeOption[] = [
  { state: "VACATION", label: "Full Vacation", shortLabel: "Vacation", icon: Palmtree, type: "vacation", active: DAY_COLORS.vacation.active },
  { state: "HALF_AM", label: "½ Day — AM", shortLabel: "½ AM", icon: Sun, type: "half_vacation", halfPeriod: "MORNING", active: DAY_COLORS.halfDay.active },
  { state: "HALF_PM", label: "½ Day — PM", shortLabel: "½ PM", icon: Moon, type: "half_vacation", halfPeriod: "AFTERNOON", active: DAY_COLORS.halfDay.active },
  { state: "FLOAT", label: "Hospital Float", shortLabel: "Float", icon: Building2, type: "float", active: DAY_COLORS.float.active },
  { state: "ROUNDER", label: "ICU Rounder", shortLabel: "Rounder", icon: Stethoscope, type: "rounder", active: DAY_COLORS.rounder.active },
  { state: "CALL", label: "General Call", shortLabel: "Call", icon: Phone, type: "call", active: DAY_COLORS.call.active },
  { state: "NO_CALL", label: "No-Call Day", shortLabel: "No-Call", icon: PhoneOff, type: "no_call", active: DAY_COLORS.noCall.active },
  { state: "NONE", label: "Clear", shortLabel: "Clear", icon: X, type: "clear", active: "bg-muted text-foreground border-border" },
];
