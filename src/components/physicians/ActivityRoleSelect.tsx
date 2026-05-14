"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RoleOption = {
  name: string;
  displayName: string;
  category: string;
};

export function ActivityRoleSelect({
  roles,
  selectedRole,
}: {
  roles: RoleOption[];
  selectedRole: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(value: string | null) {
    if (!value) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("actRole", value);
    router.push(`?${params.toString()}`);
  }

  const categories = [
    { key: "ON_CALL", label: "On Call" },
    { key: "DAYTIME", label: "Daytime" },
    { key: "READING", label: "Reading / Studies" },
    { key: "SPECIAL", label: "Special" },
  ];

  return (
    <Select value={selectedRole} onValueChange={handleChange}>
      <SelectTrigger className="h-7 w-[140px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {categories.map((cat) => {
          const catRoles = roles.filter((r) => r.category === cat.key);
          if (catRoles.length === 0) return null;
          return (
            <SelectGroup key={cat.key}>
              <SelectLabel className="text-xs">{cat.label}</SelectLabel>
              {catRoles.map((r) => (
                <SelectItem key={r.name} value={r.name} className="text-xs pl-4">
                  {r.displayName}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
