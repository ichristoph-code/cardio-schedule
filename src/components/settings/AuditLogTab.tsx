"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";

const selectClassName =
  "flex h-9 w-full items-center rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 text-[13px] shadow-[0_0.5px_1px_rgba(0,0,0,0.04)] transition-all duration-200 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:shadow-[0_0.5px_2px_rgba(0,0,0,0.06)] dark:border-input dark:bg-input/30";

interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

const ENTITY_TYPES = [
  "SchedulingRule",
  "RoleType",
  "Holiday",
  "User",
  "Physician",
  "Schedule",
  "VacationRequest",
  "NoCallDayRequest",
  "SwapRequest",
  "ScheduleAssignment",
];

const ACTION_STYLES: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  ENABLE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  DISABLE: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

function getActionStyle(action: string): string {
  for (const [key, style] of Object.entries(ACTION_STYLES)) {
    if (action.startsWith(key)) return style;
  }
  return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
}

const PAGE_SIZE = 25;

export function AuditLogTab() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState("");
  const [searchAction, setSearchAction] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (entityType) params.set("entityType", entityType);
      if (searchAction) params.set("action", searchAction.toUpperCase());

      const res = await fetch(`/api/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [offset, entityType, searchAction]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function handleFilter() {
    setOffset(0);
    fetchLogs();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Audit Log</h2>
        <p className="text-sm text-muted-foreground">
          Review all actions performed by administrators in the system.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Entity Type</Label>
          <select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setOffset(0);
            }}
            className={`${selectClassName} w-[180px]`}
          >
            <option value="">All Types</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Action</Label>
          <div className="flex gap-1">
            <Input
              value={searchAction}
              onChange={(e) => setSearchAction(e.target.value)}
              placeholder="e.g. CREATE_RULE"
              className="w-[180px] h-9 text-[13px]"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFilter();
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-2"
              onClick={handleFilter}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="hidden md:table-cell">Entity</TableHead>
              <TableHead className="hidden lg:table-cell">Details</TableHead>
              <TableHead className="hidden md:table-cell">User ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  No audit log entries found.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getActionStyle(log.action)}`}
                    >
                      {log.action}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-xs text-muted-foreground">
                      {log.entityType}
                    </span>
                    <span className="text-xs text-muted-foreground/60 ml-1">
                      {log.entityId.slice(0, 8)}...
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {log.details ? (
                      <span className="text-xs text-muted-foreground font-mono">
                        {JSON.stringify(log.details).slice(0, 80)}
                        {JSON.stringify(log.details).length > 80 && "..."}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground font-mono">
                    {log.userId.slice(0, 8)}...
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
