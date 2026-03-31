"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RuleRow, type RuleData } from "./RuleRow";
import { toast } from "sonner";

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

interface DraggableRulesTableProps {
  rules: RuleData[];
  roleTypes: RoleTypeOption[];
  physicians: PhysicianOption[];
}

export function DraggableRulesTable({
  rules: initialRules,
  roleTypes,
  physicians,
}: DraggableRulesTableProps) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = rules.findIndex((r) => r.id === active.id);
      const newIndex = rules.findIndex((r) => r.id === over.id);
      const reordered = arrayMove(rules, oldIndex, newIndex);

      // Optimistic update
      setRules(reordered);

      try {
        const res = await fetch("/api/rules/reorder", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderedIds: reordered.map((r) => r.id),
          }),
        });
        if (!res.ok) {
          toast.error("Failed to save new order");
          setRules(rules); // revert
        } else {
          toast.success("Rule order updated");
          router.refresh();
        }
      } catch {
        toast.error("Network error");
        setRules(rules); // revert
      }
    },
    [rules, router]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden md:table-cell">Role</TableHead>
              <TableHead className="hidden md:table-cell">Priority</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <SortableContext
            items={rules.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <TableBody>
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No scheduling rules configured. Click &quot;Add Rule&quot; to
                    create one.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    roleTypes={roleTypes}
                    physicians={physicians}
                  />
                ))
              )}
            </TableBody>
          </SortableContext>
        </Table>
      </div>
    </DndContext>
  );
}
