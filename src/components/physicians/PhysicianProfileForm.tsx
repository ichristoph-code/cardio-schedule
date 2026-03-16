"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Save, Eye, EyeOff } from "lucide-react";

interface RoleType {
  id: string;
  name: string;
  displayName: string;
  category: string;
}

interface PhysicianData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  fteDays: number;
  isInterventionalist: boolean;
  isEP: boolean;
  officeDays: number[];
  eligibleRoleIds: string[];
}

interface Props {
  physician: PhysicianData;
  roleTypes: RoleType[];
}

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
];

const CATEGORY_LABELS: Record<string, string> = {
  ON_CALL: "On-Call Roles",
  DAYTIME: "Daytime Coverage",
  READING: "Reading / Interpretation",
  SPECIAL: "Special Procedures",
};

const CATEGORY_COLORS: Record<string, string> = {
  ON_CALL: "bg-blue-50 border-blue-200",
  DAYTIME: "bg-green-50 border-green-200",
  READING: "bg-orange-50 border-orange-200",
  SPECIAL: "bg-purple-50 border-purple-200",
};

export function PhysicianProfileForm({ physician, roleTypes }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState(physician.firstName);
  const [lastName, setLastName] = useState(physician.lastName);
  const [email, setEmail] = useState(physician.email);
  const [phone, setPhone] = useState(physician.phone || "");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fteDays, setFteDays] = useState(physician.fteDays);
  const [isInterventionalist, setIsInterventionalist] = useState(
    physician.isInterventionalist
  );
  const [isEP, setIsEP] = useState(physician.isEP);
  const [officeDays, setOfficeDays] = useState<number[]>(physician.officeDays);
  const [eligibleRoleIds, setEligibleRoleIds] = useState<string[]>(
    physician.eligibleRoleIds
  );

  function toggleOfficeDay(day: number) {
    setOfficeDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function toggleRole(roleId: string) {
    setEligibleRoleIds((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId]
    );
  }

  // Group roles by category
  const rolesByCategory = roleTypes.reduce(
    (acc, role) => {
      if (!acc[role.category]) acc[role.category] = [];
      acc[role.category].push(role);
      return acc;
    },
    {} as Record<string, RoleType[]>
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setLoading(true);

    const res = await fetch(`/api/physicians/${physician.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        phone: phone || null,
        fteDays,
        isInterventionalist,
        isEP,
        officeDays,
        eligibleRoleIds,
        ...(newPassword ? { newPassword } : {}),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to update physician");
    } else {
      setSuccess(true);
      setNewPassword("");
      router.refresh();
      setTimeout(() => setSuccess(false), 3000);
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold tracking-tight flex-1">Edit Profile</h2>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && (
          <p className="text-sm text-green-600">Saved successfully</p>
        )}
        <Button type="submit" disabled={loading}>
          <Save className="mr-2 h-4 w-4" />
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column: Basic info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => {
                    // Auto-format phone number as (xxx) xxx-xxxx
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                    let formatted = digits;
                    if (digits.length > 6) {
                      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
                    } else if (digits.length > 3) {
                      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
                    } else if (digits.length > 0) {
                      formatted = `(${digits}`;
                    }
                    setPhone(formatted);
                  }}
                  placeholder="(555) 555-5555"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fteDays">FTE Days (200 = full time)</Label>
                <Input
                  id="fteDays"
                  type="number"
                  min={0}
                  max={365}
                  value={fteDays}
                  onChange={(e) => setFteDays(parseInt(e.target.value) || 0)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subspecialty</CardTitle>
              <CardDescription>
                These flags drive scheduling rules automatically
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="interventionalist" className="cursor-pointer">
                  Interventionalist
                </Label>
                <Switch
                  id="interventionalist"
                  checked={isInterventionalist}
                  onCheckedChange={setIsInterventionalist}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <Label htmlFor="ep" className="cursor-pointer">
                  Electrophysiologist (EP)
                </Label>
                <Switch
                  id="ep"
                  checked={isEP}
                  onCheckedChange={setIsEP}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Office Days</CardTitle>
              <CardDescription>
                Regular days this physician is in the office
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {DAYS.map((day) => (
                  <div key={day.value} className="flex items-center gap-3">
                    <Checkbox
                      id={`day-${day.value}`}
                      checked={officeDays.includes(day.value)}
                      onCheckedChange={() => toggleOfficeDay(day.value)}
                    />
                    <Label
                      htmlFor={`day-${day.value}`}
                      className="cursor-pointer"
                    >
                      {day.label}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reset Password</CardTitle>
              <CardDescription>
                Set a new password for this physician. Leave blank to keep current password.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Role eligibility matrix */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Role Eligibility</CardTitle>
              <CardDescription>
                Check the roles this physician is eligible to fill. The scheduling
                algorithm will only assign checked roles.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
                const roles = rolesByCategory[category];
                if (!roles?.length) return null;

                return (
                  <div key={category}>
                    <div className="mb-3 flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={CATEGORY_COLORS[category]}
                      >
                        {label}
                      </Badge>
                    </div>
                    <div className="space-y-3 pl-1">
                      {roles.map((role) => (
                        <div
                          key={role.id}
                          className="flex items-center gap-3"
                        >
                          <Checkbox
                            id={`role-${role.id}`}
                            checked={eligibleRoleIds.includes(role.id)}
                            onCheckedChange={() => toggleRole(role.id)}
                          />
                          <Label
                            htmlFor={`role-${role.id}`}
                            className="cursor-pointer"
                          >
                            {role.displayName}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
