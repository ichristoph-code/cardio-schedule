"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Copy, Loader2, RefreshCw, Smartphone, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  initialToken: string | null;
}

/**
 * Subscribe to your schedule from the calendar you already use.
 *
 * The link carries a secret; whoever has it can read this physician's schedule
 * (and nothing else), so the card says so plainly and offers a reset.
 */
export function CalendarSubscribeCard({ initialToken }: Props) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState<"create" | "reset" | "off" | null>(null);
  // The host is only known in the browser; render the URL once mounted so the
  // server and first client paint agree.
  const [host, setHost] = useState<string>("");
  useEffect(() => setHost(window.location.host), []);

  const path = token ? `/api/ics/${token}` : null;
  const httpsUrl = path && host ? `https://${host}${path}` : null;
  // webcal:// makes iPhone, Mac and Outlook open a "Subscribe?" prompt instead
  // of downloading a one-off file.
  const webcalUrl = path && host ? `webcal://${host}${path}` : null;

  async function call(kind: "create" | "reset" | "off") {
    setBusy(kind);
    try {
      const res = await fetch("/api/calendar-token", { method: kind === "off" ? "DELETE" : "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Request failed");
      if (kind === "off") {
        setToken(null);
        toast.success("Calendar link turned off");
      } else {
        const data = await res.json();
        setToken(data.token);
        toast.success(kind === "create" ? "Calendar link created" : "New link issued — the old one no longer works");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!httpsUrl) return;
    try {
      await navigator.clipboard.writeText(httpsUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — select the link and copy it by hand");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <CardTitle>Subscribe in your calendar</CardTitle>
        </div>
        <CardDescription>
          See your call, float, rounder, vacation and office holidays in the calendar you already
          use — iPhone, Google Calendar, Outlook. Add it once; it updates itself.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!token ? (
          <Button onClick={() => call("create")} disabled={busy !== null} className="gap-2">
            {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            Create my calendar link
          </Button>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                render={<a href={webcalUrl ?? "#"} />}
                disabled={!webcalUrl}
                className="gap-2"
              >
                <CalendarPlus className="h-4 w-4" />
                Add to iPhone / Mac Calendar
              </Button>
              <Button variant="outline" onClick={copy} disabled={!httpsUrl} className="gap-2">
                <Copy className="h-4 w-4" />
                Copy link
              </Button>
            </div>

            <div className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs break-all text-muted-foreground">
              {httpsUrl ?? "…"}
            </div>

            <p className="text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">This link is private.</strong> Anyone who
              has it can see your schedule. If a phone is lost or the link gets forwarded, reset it —
              the old link stops working immediately and you re-add the new one.
            </p>
            <p className="text-xs text-muted-foreground">
              Your phone checks for changes on its own schedule (typically hourly to daily), so a
              same-day change may take a while to appear. For Google Calendar, paste the copied link
              under <em>Other calendars → From URL</em>.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => call("reset")} disabled={busy !== null} className="gap-2">
                {busy === "reset" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Reset link
              </Button>
              <Button variant="ghost" size="sm" onClick={() => call("off")} disabled={busy !== null} className="gap-2 text-muted-foreground">
                {busy === "off" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                Turn off
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
