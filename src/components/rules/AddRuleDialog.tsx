"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
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

interface AddRuleDialogProps {
  roleTypes: RoleTypeOption[];
  physicians: PhysicianOption[];
}

export function AddRuleDialog({ roleTypes, physicians }: AddRuleDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground h-10 px-4 py-2 text-sm font-medium hover:bg-primary/90">
        <Plus className="mr-2 h-4 w-4" />
        Add Rule
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Scheduling Rule</DialogTitle>
          <DialogDescription>
            Create a rule that governs how the scheduler assigns roles to
            physicians.
          </DialogDescription>
        </DialogHeader>
        <RuleForm
          mode="create"
          roleTypes={roleTypes}
          physicians={physicians}
          onSuccess={() => {
            setOpen(false);
            toast.success("Rule created successfully");
            router.refresh();
          }}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
