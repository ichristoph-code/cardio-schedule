import { describe, it, expect } from "vitest";
import { buildIcsFeed, escapeText, foldLine, type FeedEvent } from "./ics";

const NOW = new Date("2026-09-19T21:00:00Z");
const call: FeedEvent = { uid: "a1@cardioschedule", start: "2027-03-05", end: "2027-03-05", summary: "General Call", busy: true };

describe("buildIcsFeed", () => {
  it("wraps events in a valid calendar with CRLF line endings", () => {
    const ics = buildIcsFeed([call], { name: "Test", now: NOW });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/); // every LF is preceded by CR
  });

  it("emits an all-day event with an exclusive end date", () => {
    const ics = buildIcsFeed([call], { name: "Test", now: NOW });
    expect(ics).toContain("DTSTART;VALUE=DATE:20270305\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20270306\r\n"); // the day after, per RFC 5545
    expect(ics).not.toContain("VALARM"); // no reminders, by decision
  });

  it("spans a multi-day vacation as one event", () => {
    const vac: FeedEvent = { uid: "v1@cardioschedule", start: "2027-07-19", end: "2027-07-23", summary: "Vacation", busy: true };
    const ics = buildIcsFeed([vac], { name: "Test", now: NOW });
    expect(ics).toContain("DTSTART;VALUE=DATE:20270719\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20270724\r\n");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("crosses a month and year boundary correctly on the exclusive end", () => {
    const e: FeedEvent = { uid: "x@cardioschedule", start: "2027-12-31", end: "2027-12-31", summary: "Call", busy: true };
    expect(buildIcsFeed([e], { name: "T", now: NOW })).toContain("DTEND;VALUE=DATE:20280101\r\n");
  });

  it("marks holidays transparent and duties opaque", () => {
    const hol: FeedEvent = { uid: "h@cardioschedule", start: "2027-11-25", end: "2027-11-25", summary: "Thanksgiving", busy: false };
    const ics = buildIcsFeed([call, hol], { name: "T", now: NOW });
    expect(ics).toMatch(/SUMMARY:General Call\r\n(?:.*\r\n)*?TRANSP:OPAQUE/);
    expect(ics).toMatch(/SUMMARY:Thanksgiving\r\n(?:.*\r\n)*?TRANSP:TRANSPARENT/);
  });

  it("keeps UIDs stable so subscribers update instead of duplicating", () => {
    const a = buildIcsFeed([call], { name: "T", now: NOW });
    const b = buildIcsFeed([call], { name: "T", now: new Date("2026-09-20T09:00:00Z") });
    expect(a).toContain("UID:a1@cardioschedule");
    expect(b).toContain("UID:a1@cardioschedule");
  });

  it("orders events by date regardless of input order", () => {
    const later: FeedEvent = { ...call, uid: "b@x", start: "2027-03-09", end: "2027-03-09" };
    const ics = buildIcsFeed([later, call], { name: "T", now: NOW });
    expect(ics.indexOf("20270305")).toBeLessThan(ics.indexOf("20270309"));
  });

  it("asks subscribers to refresh hourly", () => {
    expect(buildIcsFeed([], { name: "T", now: NOW })).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
  });
});

describe("escapeText", () => {
  it("escapes the four characters RFC 5545 requires", () => {
    expect(escapeText("Cardioversion / TEE; a, b\\c\nnext")).toBe("Cardioversion / TEE\; a\\, b\\\\c\\nnext");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:Call")).toBe("SUMMARY:Call");
  });

  it("folds at 75 octets with a continuation space", () => {
    const long = "DESCRIPTION:" + "x".repeat(100);
    const folded = foldLine(long);
    const parts = folded.split("\r\n");
    expect(parts[0]).toHaveLength(75);
    expect(parts[1].startsWith(" ")).toBe(true);
    // Unfolding (drop each CRLF + space) must give back exactly the input.
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });

  it("never splits a multi-byte character", () => {
    const long = "SUMMARY:" + "é".repeat(60); // 2 bytes each → 128 bytes, no clean 75 boundary
    const folded = foldLine(long);
    const unfolded = folded.replace(/\r\n /g, "");
    expect(unfolded).toBe(long);
    for (const part of folded.split("\r\n")) expect(Buffer.from(part, "utf8").length).toBeLessThanOrEqual(75);
  });
});
