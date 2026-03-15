"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { RuleForm } from "./RuleForm";

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
  physicianId: string | null;
  parameters: Record<string, unknown>;
  isActive: boolean;
  priority: number;
}

interface EditRuleDialogProps {
  rule: RuleData;
  roleTypes: RoleTypeOption[];
  physicians: PhysicianOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditRuleDialog({
  rule,
  roleTypes,
  physicians,
  open,
  onOpenChange,
}: EditRuleDialogProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Rule</DialogTitle>
          <DialogDescription>
            Modify the scheduling rule configuration.
          </DialogDescription>
        </DialogHeader>
        <RuleForm
          mode="edit"
          roleTypes={roleTypes}
          physicians={physicians}
          initialData={rule}
          onSuccess={() => {
            onOpenChange(false);
            toast.success("Rule updated successfully");
            router.refresh();
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
