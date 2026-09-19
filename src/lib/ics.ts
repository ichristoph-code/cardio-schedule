// Build an iCalendar (RFC 5545) feed of a physician's year.
//
// Every event is an all-day event. Call shifts have real hours, but nobody has
// committed to them in the data, and an all-day "General Call" on the right
// day is honest and useful; timed events can come later without changing the
// subscription URL. No reminders (VALARM) — a physician who wants one adds it
// in their own calendar app, once, and it applies to every event in the feed.
//
// Pure: takes plain data, returns a string. The API route does the fetching.

export interface FeedEvent {
  /** Stable across regenerations, so the phone updates rather than duplicates. */
  uid: string;
  /** First day, YYYY-MM-DD. */
  start: string;
  /** Last day inclusive, YYYY-MM-DD. Same as start for a single day. */
  end: string;
  summary: string;
  description?: string;
  /**
   * Whether the day reads as busy. Duties and vacation block time; an office
   * holiday is information, not a commitment, so it stays transparent.
   */
  busy: boolean;
}

export interface FeedOptions {
  /** Shown as the calendar's name in the subscriber's app. */
  name: string;
  /** Feed generation time, for DTSTAMP. Injectable so tests are stable. */
  now?: Date;
}

/** YYYY-MM-DD → YYYYMMDD, the DATE form iCalendar wants. */
function icsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

/** The day after an inclusive end date, since DTEND for all-day events is exclusive. */
function dayAfter(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newline must be escaped in text values. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF + one space.
 * Folds on byte count, not character count, so multi-byte text stays intact.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  let first = true;
  while (i < bytes.length) {
    // 75 for the first line, 74 after (the leading space counts).
    let take = Math.min(first ? 75 : 74, bytes.length - i);
    // Don't split a multi-byte character: back off to a byte that starts one.
    while (take > 1 && i + take < bytes.length && (bytes[i + take] & 0xc0) === 0x80) take -= 1;
    out.push((first ? "" : " ") + bytes.subarray(i, i + take).toString("utf8"));
    i += take;
    first = false;
  }
  return out.join("\r\n");
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildIcsFeed(events: FeedEvent[], opts: FeedOptions): string {
  const dtstamp = stamp(opts.now ?? new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CardioSchedule//Physician Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    // Ask subscribers to re-fetch hourly. Apple honours the refresh interval on
    // subscribed calendars; others fall back to their own schedule.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  // Sorted so the output is stable for a given input — diffs and tests stay readable.
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start) || a.uid.localeCompare(b.uid));
  for (const e of sorted) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.start)}`,
      `DTEND;VALUE=DATE:${icsDate(dayAfter(e.end))}`,
      `SUMMARY:${escapeText(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push(`TRANSP:${e.busy ? "OPAQUE" : "TRANSPARENT"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
