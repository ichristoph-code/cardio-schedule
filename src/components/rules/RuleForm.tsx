"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

// Native <select> styled to match the design system — avoids Base UI Portal
// rendering issues where SelectValue shows raw values instead of display labels
const selectClassName =
  "flex h-9 w-full items-center rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 text-[13px] shadow-[0_0.5px_1px_rgba(0,0,0,0.04)] transition-all duration-200 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:shadow-[0_0.5px_2px_rgba(0,0,0,0.06)] dark:border-input dark:bg-input/30";

const RULE_TYPE_OPTIONS = [
  { value: "EXCLUSION", label: "Exclusion" },
  { value: "PREREQUISITE", label: "Prerequisite" },
  { value: "DISTRIBUTION", label: "Distribution" },
  { value: "CONFLICT", label: "Conflict" },
];

const EXCLUSION_MODES = [
  { value: "exclude", label: "Exclude Subspecialty" },
  { value: "require", label: "Require Subspecialty" },
  { value: "eligibility", label: "Require Eligibility" },
];

const SUBSPECIALTY_OPTIONS = [
  { value: "isInterventionalist", label: "Interventionalist" },
  { value: "isEP", label: "Electrophysiologist (EP)" },
];

const ROLE_CATEGORIES = [
  { value: "ON_CALL", label: "On Call" },
  { value: "DAYTIME", label: "Daytime" },
  { value: "READING", label: "Reading" },
  { value: "SPECIAL", label: "Special" },
];

interface RoleTypeOption {
  id: string;
  name: string;
  displayName: string;
  category: string;
}

interface PhysicianOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface RuleData {
  id: string;
  name: string;
  description: string | null;
  ruleType: string;
  roleTypeId: string | null;
  physicianId?: string | null;
  parameters: Record<string, unknown>;
  isActive: boolean;
  priority: number;
}

interface RuleFormProps {
  mode: "create" | "edit";
  roleTypes: RoleTypeOption[];
  physicians: PhysicianOption[];
  initialData?: RuleData;
  onSuccess: () => void;
  onCancel: () => void;
}

function parseExistingParameters(
  ruleType: string,
  params: Record<string, unknown>
) {
  if (ruleType === "EXCLUSION") {
    if (params.excludeSubspecialty)
      return {
        exclusionMode: "exclude" as const,
        subspecialtyAttr: params.excludeSubspecialty as string,
      };
    if (params.requireSubspecialty)
      return {
        exclusionMode: "require" as const,
        subspecialtyAttr: params.requireSubspecialty as string,
      };
    return { exclusionMode: "eligibility" as const, subspecialtyAttr: "isInterventionalist" };
  }
  if (ruleType === "PREREQUISITE") {
    return {
      requireOfficeDay: params.requireOfficeDay === true,
      coupleWithGeneralCall: params.coupleWithGeneralCall === true,
      preferredPhysician: params.preferredPhysician === true,
    };
  }
  if (ruleType === "DISTRIBUTION") {
    return {
      distributeEvenly: params.distributeEvenly === true,
      ignoreFTE: params.ignoreFTE === true,
    };
  }
  if (ruleType === "CONFLICT") {
    return {
      noConsecutiveCallDays: params.noConsecutiveCallDays === true,
      noConsecutiveWeekendCall: params.noConsecutiveWeekendCall === true,
      callCategories: (params.callCategories as string[]) ?? ["ON_CALL"],
    };
  }
  return {};
}

export function RuleForm({
  mode,
  roleTypes,
  physicians,
  initialData,
  onSuccess,
  onCancel,
}: RuleFormProps) {
  const existingParams = initialData
    ? parseExistingParameters(initialData.ruleType, initialData.parameters)
    : {};

  // Common fields
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [ruleType, setRuleType] = useState(initialData?.ruleType ?? "EXCLUSION");
  const [roleTypeId, setRoleTypeId] = useState(initialData?.roleTypeId ?? "");
  const [priority, setPriority] = useState(initialData?.priority ?? 0);
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);

  // EXCLUSION params
  const [exclusionMode, setExclusionMode] = useState(
    ("exclusionMode" in existingParams ? existingParams.exclusionMode : "exclude") as string
  );
  const [subspecialtyAttr, setSubspecialtyAttr] = useState(
    ("subspecialtyAttr" in existingParams
      ? existingParams.subspecialtyAttr
      : "isInterventionalist") as string
  );

  // PREREQUISITE params
  const [requireOfficeDay, setRequireOfficeDay] = useState(
    "requireOfficeDay" in existingParams ? existingParams.requireOfficeDay === true : true
  );
  const [coupleWithGeneralCall, setCoupleWithGeneralCall] = useState(
    "coupleWithGeneralCall" in existingParams ? existingParams.coupleWithGeneralCall === true : false
  );
  const [preferredPhysician, setPreferredPhysician] = useState(
    "preferredPhysician" in existingParams ? existingParams.preferredPhysician === true : false
  );
  const [physicianId, setPhysicianId] = useState(initialData?.physicianId ?? "");

  // DISTRIBUTION params
  const [distributeEvenly, setDistributeEvenly] = useState(
    "distributeEvenly" in existingParams ? existingParams.distributeEvenly === true : true
  );
  const [ignoreFTE, setIgnoreFTE] = useState(
    "ignoreFTE" in existingParams ? existingParams.ignoreFTE === true : false
  );

  // CONFLICT params
  const [noConsecutiveCallDays, setNoConsecutiveCallDays] = useState(
    "noConsecutiveCallDays" in existingParams
      ? existingParams.noConsecutiveCallDays === true
      : true
  );
  const [noConsecutiveWeekendCall, setNoConsecutiveWeekendCall] = useState(
    "noConsecutiveWeekendCall" in existingParams
      ? existingParams.noConsecutiveWeekendCall === true
      : false
  );
  const [callCategories, setCallCategories] = useState<string[]>(
    "callCategories" in existingParams
      ? (existingParams.callCategories as string[])
      : ["ON_CALL"]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggleCategory = useCallback((cat: string) => {
    setCallCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }, []);

  function buildParameters(): Record<string, unknown> {
    switch (ruleType) {
      case "EXCLUSION":
        if (exclusionMode === "exclude")
          return { excludeSubspecialty: subspecialtyAttr };
        if (exclusionMode === "require")
          return { requireSubspecialty: subspecialtyAttr };
        return { requireEligibility: true };
      case "PREREQUISITE": {
        const prereqParams: Record<string, unknown> = {};
        if (requireOfficeDay) prereqParams.requireOfficeDay = true;
        if (coupleWithGeneralCall) prereqParams.coupleWithGeneralCall = true;
        if (preferredPhysician) prereqParams.preferredPhysician = true;
        return prereqParams;
      }
      case "DISTRIBUTION":
        return { distributeEvenly, ignoreFTE };
      case "CONFLICT": {
        const params: Record<string, unknown> = {};
        if (noConsecutiveCallDays) params.noConsecutiveCallDays = true;
        if (noConsecutiveWeekendCall) params.noConsecutiveWeekendCall = true;
        params.callCategories = callCategories;
        return params;
      }
      default:
        return {};
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const payload = {
      name,
      description: description || null,
      ruleType,
      roleTypeId: roleTypeId || null,
      physicianId: physicianId || null,
      parameters: buildParameters(),
      priority,
      isActive,
    };

    try {
      const url =
        mode === "create"
          ? "/api/rules"
          : `/api/rules/${initialData!.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save rule");
        setLoading(false);
        return;
      }

      onSuccess();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Common fields */}
      <div className="space-y-2">
        <Label htmlFor="ruleName">Name</Label>
        <Input
          id="ruleName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., No consecutive weekend call"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ruleDescription">Description (optional)</Label>
        <Input
          id="ruleDescription"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Explain what this rule does"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ruleType">Rule Type</Label>
          <select
            id="ruleType"
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value)}
            className={selectClassName}
          >
            {RULE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="roleTypeId">Applies to Role</Label>
          <select
            id="roleTypeId"
            value={roleTypeId}
            onChange={(e) => setRoleTypeId(e.target.value)}
            className={selectClassName}
          >
            <option value="">Global (all roles)</option>
            {roleTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="rulePriority">Priority</Label>
          <Input
            id="rulePriority"
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            min={0}
            max={100}
          />
          <p className="text-xs text-muted-foreground">Higher = evaluated first</p>
        </div>

        <div className="space-y-2">
          <Label>Active</Label>
          <div className="flex items-center gap-2 pt-1">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <span className="text-sm text-muted-foreground">
              {isActive ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic parameter fields */}
      <div className="rounded-md border p-4 space-y-3">
        <Label className="text-sm font-semibold">Parameters</Label>

        {ruleType === "EXCLUSION" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="exclusionMode">Mode</Label>
              <select
                id="exclusionMode"
                value={exclusionMode}
                onChange={(e) => setExclusionMode(e.target.value)}
                className={selectClassName}
              >
                {EXCLUSION_MODES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {exclusionMode !== "eligibility" && (
              <div className="space-y-2">
                <Label htmlFor="subspecialty">Subspecialty</Label>
                <select
                  id="subspecialty"
                  value={subspecialtyAttr}
                  onChange={(e) => setSubspecialtyAttr(e.target.value)}
                  className={selectClassName}
                >
                  {SUBSPECIALTY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {ruleType === "PREREQUISITE" && (
          <>
            <div className="flex items-center gap-3">
              <Switch
                checked={requireOfficeDay}
                onCheckedChange={setRequireOfficeDay}
              />
              <Label>Require Office Day</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={coupleWithGeneralCall}
                onCheckedChange={setCoupleWithGeneralCall}
              />
              <div>
                <Label>Couple with General Call</Label>
                <p className="text-xs text-muted-foreground">
                  When an interventionalist is on general call, they also get interventional call
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Switch
                  checked={preferredPhysician}
                  onCheckedChange={setPreferredPhysician}
                />
                <div>
                  <Label>Preferred Physician</Label>
                  <p className="text-xs text-muted-foreground">
                    Always assign this role to a specific physician when available
                  </p>
                </div>
              </div>
              {preferredPhysician && (
                <div className="ml-12 space-y-1">
                  <Label htmlFor="physicianSelect">Physician</Label>
                  <select
                    id="physicianSelect"
                    value={physicianId}
                    onChange={(e) => setPhysicianId(e.target.value)}
                    className={selectClassName}
                  >
                    <option value="">Select a physician...</option>
                    {physicians.map((p) => (
                      <option key={p.id} value={p.id}>
                        Dr. {p.lastName}, {p.firstName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </>
        )}

        {ruleType === "DISTRIBUTION" && (
          <>
            <div className="flex items-center gap-3">
              <Switch
                checked={distributeEvenly}
                onCheckedChange={setDistributeEvenly}
              />
              <Label>Distribute Evenly</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={ignoreFTE} onCheckedChange={setIgnoreFTE} />
              <Label>Ignore FTE</Label>
            </div>
          </>
        )}

        {ruleType === "CONFLICT" && (
          <>
            <div className="flex items-center gap-3">
              <Switch
                checked={noConsecutiveCallDays}
                onCheckedChange={setNoConsecutiveCallDays}
              />
              <Label>No Consecutive Call Days</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={noConsecutiveWeekendCall}
                onCheckedChange={setNoConsecutiveWeekendCall}
              />
              <Label>No Consecutive Weekend Call</Label>
            </div>
            <div className="space-y-2">
              <Label>Call Categories</Label>
              <div className="flex flex-wrap gap-4">
                {ROLE_CATEGORIES.map((cat) => (
                  <label
                    key={cat.value}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={callCategories.includes(cat.value)}
                      onCheckedChange={() => toggleCategory(cat.value)}
                    />
                    {cat.label}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
              ? "Create Rule"
              : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
