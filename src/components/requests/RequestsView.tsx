"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Palmtree,
  ArrowLeftRight,
  MoonStar,
  Check,
  X,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

// --- Types ---

interface VacationRequest {
  id: string;
  physicianId: string;
  physicianName: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: string;
}

interface SwapRequest {
  id: string;
  fromPhysicianId: string;
  fromPhysicianName: string;
  toPhysicianId: string;
  toPhysicianName: string;
  date: string;
  roleDisplayName: string;
  roleTypeId: string;
  status: string;
  peerAccepted: boolean;
  reviewNote: string | null;
  createdAt: string;
}

interface NoCallDayRequest {
  id: string;
  physicianId: string;
  physicianName: string;
  date: string;
  reason: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: string;
}

interface Physician {
  id: string;
  firstName: string;
  lastName: string;
}

interface MyAssignment {
  id: string;
  date: string;
  roleDisplayName: string;
  roleTypeId: string;
}

const MONTH_NAMES = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

function statusBadge(status: string) {
  switch (status) {
    case "PENDING":
      return <Badge variant="secondary">Pending</Badge>;
    case "APPROVED":
      return <Badge className="bg-green-600 hover:bg-green-700">Approved</Badge>;
    case "DENIED":
      return <Badge variant="destructive">Denied</Badge>;
    case "CANCELLED":
      return <Badge variant="outline">Cancelled</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

// --- Main Component ---

export function RequestsView({
  isAdmin,
  physicianId,
  vacationRequests: initialVacations,
  swapRequests: initialSwaps,
  noCallDayRequests: initialNoCallDays,
  physicians,
  myAssignments,
}: {
  isAdmin: boolean;
  physicianId: string | null;
  vacationRequests: VacationRequest[];
  swapRequests: SwapRequest[];
  noCallDayRequests: NoCallDayRequest[];
  physicians: Physician[];
  myAssignments: MyAssignment[];
}) {
  const router = useRouter();
  const [vacations, setVacations] = useState(initialVacations);
  const [swaps, setSwaps] = useState(initialSwaps);
  const [noCallDays, setNoCallDays] = useState(initialNoCallDays);

  // Sync local state when server data changes (after router.refresh())
  useEffect(() => setVacations(initialVacations), [initialVacations]);
  useEffect(() => setSwaps(initialSwaps), [initialSwaps]);
  useEffect(() => setNoCallDays(initialNoCallDays), [initialNoCallDays]);

  // Vacation form state
  const [vacStartDate, setVacStartDate] = useState("");
  const [vacEndDate, setVacEndDate] = useState("");
  const [vacReason, setVacReason] = useState("");
  const [vacSubmitting, setVacSubmitting] = useState(false);
  const [vacDialogOpen, setVacDialogOpen] = useState(false);

  // Swap form state
  const [swapAssignment, setSwapAssignment] = useState("");
  const [swapToPhysician, setSwapToPhysician] = useState("");
  const [swapSubmitting, setSwapSubmitting] = useState(false);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);

  // Bulk action state (for no-call days)
  const [bulkApproving, setBulkApproving] = useState(false);

  // Pending counts
  const pendingVacations = vacations.filter((v) => v.status === "PENDING");
  const pendingNoCallDays = noCallDays.filter((nc) => nc.status === "PENDING");
  const pendingSwaps = swaps.filter(
    (s) => s.status === "PENDING" && (isAdmin ? s.peerAccepted : true)
  );
  // Swaps awaiting MY peer acceptance
  const awaitingMyAcceptance = swaps.filter(
    (s) =>
      s.status === "PENDING" &&
      !s.peerAccepted &&
      s.toPhysicianId === physicianId
  );

  // Group pending no-call days by physician (for admin bulk actions)
  const pendingNoCallByPhysician = pendingNoCallDays.reduce((acc, nc) => {
    if (!acc[nc.physicianName]) acc[nc.physicianName] = [];
    acc[nc.physicianName].push(nc);
    return acc;
  }, {} as Record<string, NoCallDayRequest[]>);

  // --- Handlers ---

  async function submitVacation() {
    if (!vacStartDate || !vacEndDate) {
      toast.error("Please select start and end dates");
      return;
    }
    setVacSubmitting(true);
    try {
      const res = await fetch("/api/vacation-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: vacStartDate,
          endDate: vacEndDate,
          reason: vacReason || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }
      toast.success("Vacation request submitted");
      setVacDialogOpen(false);
      setVacStartDate("");
      setVacEndDate("");
      setVacReason("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setVacSubmitting(false);
    }
  }

  async function handleVacationAction(id: string, status: string, reviewNote?: string) {
    try {
      const res = await fetch(`/api/vacation-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNote }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      const updated = await res.json();
      setVacations((prev) =>
        prev.map((v) =>
          v.id === id ? { ...v, status: updated.status, reviewNote: updated.reviewNote } : v
        )
      );
      toast.success(
        status === "APPROVED"
          ? "Request approved"
          : status === "DENIED"
          ? "Request denied"
          : "Request cancelled"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function submitSwap() {
    if (!swapAssignment || !swapToPhysician) {
      toast.error("Please select an assignment and target physician");
      return;
    }
    const assignment = myAssignments.find((a) => a.id === swapAssignment);
    if (!assignment) return;

    setSwapSubmitting(true);
    try {
      const res = await fetch("/api/swap-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: assignment.date,
          roleTypeId: assignment.roleTypeId,
          toPhysicianId: swapToPhysician,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }
      toast.success("Swap request submitted");
      setSwapDialogOpen(false);
      setSwapAssignment("");
      setSwapToPhysician("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSwapSubmitting(false);
    }
  }

  async function handleSwapAction(id: string, action: string) {
    try {
      const res = await fetch(`/api/swap-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success(
        action === "peer_accept"
          ? "Swap accepted"
          : action === "approve"
          ? "Swap approved"
          : action === "peer_decline" || action === "deny"
          ? "Swap declined"
          : "Swap cancelled"
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function handleNoCallDayAction(id: string, status: string) {
    try {
      const res = await fetch(`/api/no-call-day-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      const updated = await res.json();
      setNoCallDays((prev) =>
        prev.map((nc) =>
          nc.id === id ? { ...nc, status: updated.status, reviewNote: updated.reviewNote } : nc
        )
      );
      toast.success(
        status === "APPROVED"
          ? "No-call day approved"
          : status === "DENIED"
          ? "No-call day denied"
          : "No-call day cancelled"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function handleBulkApprove(ids: string[]) {
    setBulkApproving(true);
    try {
      const res = await fetch("/api/no-call-day-requests/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status: "APPROVED" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      const result = await res.json();
      setNoCallDays((prev) =>
        prev.map((nc) => (ids.includes(nc.id) ? { ...nc, status: "APPROVED" } : nc))
      );
      toast.success(`${result.count} no-call day${result.count !== 1 ? "s" : ""} approved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      setBulkApproving(false);
    }
  }

  // --- Render ---

  return (
    <div className="space-y-4">
      {/* Pending alerts for admins and physicians */}
      {awaitingMyAcceptance.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Swap Requests Awaiting Your Response
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {awaitingMyAcceptance.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 p-2 bg-white rounded border"
              >
                <div className="text-sm">
                  <strong>{s.fromPhysicianName}</strong> wants you to cover{" "}
                  <strong>{s.roleDisplayName}</strong> on{" "}
                  <strong>{formatDateShort(s.date)}</strong>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => handleSwapAction(s.id, "peer_accept")}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => handleSwapAction(s.id, "peer_decline")}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isAdmin && (pendingVacations.length > 0 || pendingNoCallDays.length > 0) && (
        <Card className="border-blue-300 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Pending Review: {pendingVacations.length > 0 && `${pendingVacations.length} Vacation${pendingVacations.length !== 1 ? "s" : ""}`}
              {pendingVacations.length > 0 && pendingNoCallDays.length > 0 && ", "}
              {pendingNoCallDays.length > 0 && `${pendingNoCallDays.length} No-Call Day${pendingNoCallDays.length !== 1 ? "s" : ""}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingVacations.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-2 p-2 bg-white rounded border"
              >
                <div className="text-sm">
                  <Badge variant="outline" className="mr-2 text-xs">Vacation</Badge>
                  <strong>{v.physicianName}</strong>{" "}
                  {formatDateShort(v.startDate)} &ndash; {formatDateShort(v.endDate)}
                  {v.reason && (
                    <span className="text-muted-foreground ml-1">
                      &mdash; {v.reason}
                    </span>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    className="h-7"
                    onClick={() => handleVacationAction(v.id, "APPROVED")}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7"
                    onClick={() => handleVacationAction(v.id, "DENIED")}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Deny
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="vacations">
        <TabsList>
          <TabsTrigger value="vacations" className="gap-1">
            <Palmtree className="h-4 w-4" />
            Vacations
            {pendingVacations.length > 0 && !isAdmin && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {pendingVacations.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="nocall" className="gap-1">
            <MoonStar className="h-4 w-4" />
            No-Call Days
            {pendingNoCallDays.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {pendingNoCallDays.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="swaps" className="gap-1">
            <ArrowLeftRight className="h-4 w-4" />
            Swaps
            {awaitingMyAcceptance.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {awaitingMyAcceptance.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* VACATIONS TAB */}
        <TabsContent value="vacations" className="mt-4 space-y-4">
          {physicianId && (
            <Dialog open={vacDialogOpen} onOpenChange={setVacDialogOpen}>
              <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground h-10 px-4 py-2 text-sm font-medium hover:bg-primary/90">
                <Plus className="mr-2 h-4 w-4" />
                Request Vacation
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request Vacation</DialogTitle>
                  <DialogDescription>
                    Submit a vacation request for admin approval. Approved
                    vacations will be considered when generating schedules.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Start Date</Label>
                      <DatePicker
                        value={vacStartDate}
                        onChange={setVacStartDate}
                        placeholder="Start date"
                      />
                    </div>
                    <div>
                      <Label>End Date</Label>
                      <DatePicker
                        value={vacEndDate}
                        onChange={setVacEndDate}
                        placeholder="End date"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Reason (optional)</Label>
                    <Input
                      placeholder="e.g., Family vacation, CME conference"
                      value={vacReason}
                      onChange={(e) => setVacReason(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setVacDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={submitVacation} disabled={vacSubmitting}>
                    {vacSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Submit
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Vacation list */}
          {vacations.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No vacation requests yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {vacations.map((v) => (
                <Card key={v.id} className="shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {isAdmin && (
                          <div className="text-sm font-medium mb-0.5">
                            {v.physicianName}
                          </div>
                        )}
                        <div className="text-sm">
                          {formatDateShort(v.startDate)} &ndash;{" "}
                          {formatDateShort(v.endDate)}
                          <span className="text-muted-foreground ml-2">
                            ({daysBetween(v.startDate, v.endDate)} days)
                          </span>
                        </div>
                        {v.reason && (
                          <div className="text-sm text-muted-foreground mt-0.5">
                            {v.reason}
                          </div>
                        )}
                        {v.reviewNote && (
                          <div className="text-xs text-muted-foreground mt-1 italic">
                            Note: {v.reviewNote}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {statusBadge(v.status)}
                        {v.status === "PENDING" &&
                          v.physicianId === physicianId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() =>
                                handleVacationAction(v.id, "CANCELLED")
                              }
                            >
                              Cancel
                            </Button>
                          )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* NO-CALL DAYS TAB */}
        <TabsContent value="nocall" className="mt-4 space-y-4">
          <div className="text-sm text-muted-foreground">
            No-call days mean you&apos;re available for daytime roles but won&apos;t be assigned night call.
            {!isAdmin && " Use the My Preferences page to submit no-call day requests."}
          </div>

          {/* Admin bulk approve by physician */}
          {isAdmin && Object.keys(pendingNoCallByPhysician).length > 0 && (
            <Card className="border-amber-300 bg-amber-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Quick Approve</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(pendingNoCallByPhysician).map(([name, requests]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between gap-2 p-2 bg-white rounded border"
                  >
                    <div className="text-sm">
                      <strong>{name}</strong>
                      <span className="text-muted-foreground ml-1">
                        &mdash; {requests.length} pending no-call day{requests.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      className="h-7"
                      disabled={bulkApproving}
                      onClick={() => handleBulkApprove(requests.map((r) => r.id))}
                    >
                      {bulkApproving ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Check className="h-3 w-3 mr-1" />
                      )}
                      Approve All
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* No-call day list */}
          {noCallDays.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No no-call day requests yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {noCallDays.map((nc) => (
                <Card key={nc.id} className="shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {isAdmin && (
                          <div className="text-sm font-medium mb-0.5">
                            {nc.physicianName}
                          </div>
                        )}
                        <div className="text-sm">
                          {formatDateShort(nc.date)}
                        </div>
                        {nc.reason && (
                          <div className="text-sm text-muted-foreground mt-0.5">
                            {nc.reason}
                          </div>
                        )}
                        {nc.reviewNote && (
                          <div className="text-xs text-muted-foreground mt-1 italic">
                            Note: {nc.reviewNote}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {statusBadge(nc.status)}
                        {/* Admin approve/deny */}
                        {isAdmin && nc.status === "PENDING" && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleNoCallDayAction(nc.id, "APPROVED")}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs"
                              onClick={() => handleNoCallDayAction(nc.id, "DENIED")}
                            >
                              Deny
                            </Button>
                          </div>
                        )}
                        {/* Physician cancel */}
                        {!isAdmin && nc.status === "PENDING" &&
                          nc.physicianId === physicianId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => handleNoCallDayAction(nc.id, "CANCELLED")}
                            >
                              Cancel
                            </Button>
                          )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* SWAPS TAB */}
        <TabsContent value="swaps" className="mt-4 space-y-4">
          {physicianId && myAssignments.length > 0 && (
            <Dialog open={swapDialogOpen} onOpenChange={setSwapDialogOpen}>
              <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground h-10 px-4 py-2 text-sm font-medium hover:bg-primary/90">
                <Plus className="mr-2 h-4 w-4" />
                Request Swap
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request Shift Swap</DialogTitle>
                  <DialogDescription>
                    Propose swapping one of your assignments with another
                    physician. They must accept before admin approval.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <Label>Your Assignment</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                      value={swapAssignment}
                      onChange={(e) => setSwapAssignment(e.target.value)}
                    >
                      <option value="">Select assignment</option>
                      {myAssignments.map((a) => (
                        <option key={a.id} value={a.id}>
                          {formatDateShort(a.date)} — {a.roleDisplayName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Swap With</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                      value={swapToPhysician}
                      onChange={(e) => setSwapToPhysician(e.target.value)}
                    >
                      <option value="">Select physician</option>
                      {physicians
                        .filter((p) => p.id !== physicianId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.lastName}, {p.firstName}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setSwapDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={submitSwap} disabled={swapSubmitting}>
                    {swapSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Submit
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Swap list */}
          {swaps.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No swap requests yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {swaps.map((s) => (
                <Card key={s.id} className="shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm">
                          <strong>{s.fromPhysicianName}</strong>
                          {" → "}
                          <strong>{s.toPhysicianName}</strong>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {s.roleDisplayName} on {formatDateShort(s.date)}
                        </div>
                        <div className="flex gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              s.peerAccepted
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-gray-50"
                            }`}
                          >
                            Peer: {s.peerAccepted ? "Accepted" : "Pending"}
                          </Badge>
                        </div>
                        {s.reviewNote && (
                          <div className="text-xs text-muted-foreground mt-1 italic">
                            Note: {s.reviewNote}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {statusBadge(s.status)}
                        {/* Peer actions */}
                        {s.status === "PENDING" &&
                          !s.peerAccepted &&
                          s.toPhysicianId === physicianId && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() =>
                                  handleSwapAction(s.id, "peer_accept")
                                }
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() =>
                                  handleSwapAction(s.id, "peer_decline")
                                }
                              >
                                Decline
                              </Button>
                            </div>
                          )}
                        {/* Cancel own request */}
                        {s.status === "PENDING" &&
                          s.fromPhysicianId === physicianId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => handleSwapAction(s.id, "cancel")}
                            >
                              Cancel
                            </Button>
                          )}
                        {/* Admin actions */}
                        {isAdmin &&
                          s.status === "PENDING" &&
                          s.peerAccepted && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() =>
                                  handleSwapAction(s.id, "approve")
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs"
                                onClick={() => handleSwapAction(s.id, "deny")}
                              >
                                Deny
                              </Button>
                            </div>
                          )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}
