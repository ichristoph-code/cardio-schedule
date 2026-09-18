// Values shared between the vacation page (a Server Component) and the picker
// (a Client Component).
//
// These deliberately live outside PhysicianPicker.tsx. That file carries a
// "use client" directive, which makes its exports a client-module boundary —
// fine to render, but calling one of its functions from the server is not
// something to rely on. Anything both sides need belongs in a plain module
// like this one, where neither side is reaching across the boundary.

/** Cookie holding the last physician viewed on the vacation calendar. */
export const LAST_PHYSICIAN_COOKIE = "vac_last_physician";

/** Cookie holding the last year viewed on the vacation calendar. */
export const LAST_YEAR_COOKIE = "vac_last_year";

/**
 * The years the picker offers: last year through three ahead.
 *
 * The page validates a remembered year against this same list, so the two
 * cannot drift apart — and a cookie from a year that has rolled out of range
 * falls back to today rather than showing an empty calendar.
 */
export function selectableYears(): number[] {
  const thisYear = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => thisYear - 1 + i);
}
